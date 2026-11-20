import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

export interface CostLayerInput {
  companyId: string;
  productId: string;
  warehouseId?: string | null;
  locationId?: string | null;
  lotId?: string | null;
  originDocType: string;
  originDocId?: string | null;
  originDocLineId?: string | null;
  quantity: number;
  unitCost: number;
  originCurrency?: string;
  effectiveDate?: Date | string;
}

export interface FifoConsumptionResult {
  totalCost: number;
  weightedUnitCost: number;
  consumptions: Array<{
    layerId: string;
    quantityConsumed: number;
    unitCostApplied: number;
    totalCost: number;
  }>;
}

@Injectable()
export class FifoService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Crea una nueva capa de costo FIFO para una entrada valorizada de mercancía.
   */
  async createCostLayer(client: PoolClient, input: CostLayerInput): Promise<any> {
    if (input.quantity <= 0) {
      throw new ConflictException('La cantidad para una capa FIFO debe ser estrictamente positiva.');
    }
    if (input.unitCost < 0) {
      throw new ConflictException('El costo unitario para una capa FIFO no puede ser negativo.');
    }

    const query = `
      INSERT INTO inventory_cost_layers (
        company_id, product_id, warehouse_id, location_id, lot_id,
        origin_doc_type, origin_doc_id, origin_doc_line_id,
        effective_date, initial_quantity, remaining_quantity,
        origin_currency, unit_cost, functional_unit_cost, status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        COALESCE($9::timestamptz, CURRENT_TIMESTAMP), $10, $10,
        COALESCE($11, 'USD'), $12, $12, 'active'
      ) RETURNING *
    `;

    const res = await client.query(query, [
      input.companyId,
      input.productId,
      input.warehouseId || null,
      input.locationId || null,
      input.lotId || null,
      input.originDocType,
      input.originDocId || null,
      input.originDocLineId || null,
      input.effectiveDate || null,
      input.quantity,
      input.originCurrency || 'USD',
      input.unitCost,
    ]);

    return res.rows[0];
  }

  /**
   * Consume capas de costo FIFO en estricto orden cronológico (First In, First Out).
   * Bloquea las filas con FOR UPDATE para prevenir condiciones de carrera.
   */
  async consumeFifoLayers(
    client: PoolClient,
    params: {
      companyId: string;
      productId: string;
      quantity: number;
      movementLineId: string;
      warehouseId?: string | null;
    },
  ): Promise<FifoConsumptionResult> {
    const { companyId, productId, quantity, movementLineId } = params;
    if (quantity <= 0) {
      throw new ConflictException('La cantidad a consumir debe ser mayor que cero.');
    }

    // Bloquear y seleccionar capas activas ordenadas por fecha efectiva ascendente
    const layersQuery = `
      SELECT id, remaining_quantity, functional_unit_cost, effective_date
      FROM inventory_cost_layers
      WHERE company_id = $1 AND product_id = $2 AND status = 'active' AND remaining_quantity > 0
      ORDER BY effective_date ASC, created_at ASC
      FOR UPDATE
    `;

    const layersRes = await client.query(layersQuery, [companyId, productId]);
    const layers = layersRes.rows;

    let qtyNeeded = Number(quantity);
    let totalCost = 0;
    const consumptions: FifoConsumptionResult['consumptions'] = [];

    for (const layer of layers) {
      if (qtyNeeded <= 0) break;

      const layerRemaining = Number(layer.remaining_quantity);
      const consumeQty = Math.min(qtyNeeded, layerRemaining);
      const unitCost = Number(layer.functional_unit_cost);
      const lineCost = Math.round((consumeQty * unitCost + Number.EPSILON) * 10000) / 10000;

      // 1. Actualizar capa de costo
      const newRemaining = layerRemaining - consumeQty;
      const newStatus = newRemaining === 0 ? 'exhausted' : 'active';

      await client.query(
        `UPDATE inventory_cost_layers 
         SET remaining_quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newRemaining, newStatus, layer.id],
      );

      // 2. Registrar el consumo de capa
      await client.query(
        `INSERT INTO inventory_cost_consumptions (
           company_id, cost_layer_id, movement_line_id, quantity_consumed, unit_cost_applied
         ) VALUES ($1, $2, $3, $4, $5)`,
        [companyId, layer.id, movementLineId, consumeQty, unitCost],
      );

      consumptions.push({
        layerId: layer.id,
        quantityConsumed: consumeQty,
        unitCostApplied: unitCost,
        totalCost: lineCost,
      });

      totalCost += lineCost;
      qtyNeeded -= consumeQty;
    }

    if (qtyNeeded > 0.0001) {
      throw new ConflictException(
        `Existencias valorizadas insuficientes en capas FIFO para el producto ${productId}. Faltante sin capa: ${qtyNeeded.toFixed(4)}.`,
      );
    }

    const roundedTotal = Math.round((totalCost + Number.EPSILON) * 100) / 100;
    const weightedUnit = roundedTotal / Number(quantity);

    return {
      totalCost: roundedTotal,
      weightedUnitCost: weightedUnit,
      consumptions,
    };
  }

  /**
   * Obtiene las capas FIFO (activas o históricas) para un producto o empresa.
   */
  async getCostLayers(
    companyId: string,
    productId?: string,
    status?: string,
    warehouseId?: string,
  ) {
    const params: any[] = [companyId];
    const where: string[] = ['l.company_id = $1'];

    if (productId) {
      params.push(productId);
      where.push(`l.product_id = $${params.length}`);
    }
    if (status && status !== 'all') {
      params.push(status);
      where.push(`l.status = $${params.length}`);
    }
    if (warehouseId && warehouseId !== 'all') {
      params.push(warehouseId);
      where.push(`l.warehouse_id = $${params.length}`);
    }

    const query = `
      SELECT 
        l.*,
        p.name AS product_name, p.sku,
        w.name AS warehouse_name,
        loc.code AS location_code,
        lot.lot_number
      FROM inventory_cost_layers l
      JOIN products p ON p.id = l.product_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
      LEFT JOIN storage_locations loc ON loc.id = l.location_id
      LEFT JOIN inventory_lots lot ON lot.id = l.lot_id
      WHERE ${where.join(' AND ')}
      ORDER BY l.effective_date DESC, l.created_at DESC
    `;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  /**
   * Conciliación y valoración total del inventario basada en capas FIFO.
   */
  async getValuation(companyId: string, warehouseId?: string) {
    const params: any[] = [companyId];
    let warehouseFilter = '';
    if (warehouseId && warehouseId !== 'all') {
      params.push(warehouseId);
      warehouseFilter = `AND l.warehouse_id = $${params.length}`;
    }

    const query = `
      SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        COUNT(l.id)::int AS active_layers_count,
        COALESCE(SUM(l.remaining_quantity), 0)::numeric AS total_remaining_quantity,
        COALESCE(SUM(l.remaining_quantity * l.functional_unit_cost), 0)::numeric AS total_valuation,
        CASE 
          WHEN SUM(l.remaining_quantity) > 0 
          THEN ROUND((SUM(l.remaining_quantity * l.functional_unit_cost) / SUM(l.remaining_quantity))::numeric, 4)
          ELSE 0 
        END AS average_fifo_unit_cost
      FROM products p
      LEFT JOIN inventory_cost_layers l 
        ON l.product_id = p.id AND l.company_id = $1 AND l.status = 'active' AND l.remaining_quantity > 0 ${warehouseFilter}
      WHERE p.company_id = $1 AND p.archived_at IS NULL
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_valuation DESC
    `;

    const res = await this.db.query(query, params);
    const rows = res.rows;

    const totalValuation = rows.reduce((acc, r) => acc + Number(r.total_valuation), 0);
    const totalUnits = rows.reduce((acc, r) => acc + Number(r.total_remaining_quantity), 0);

    return {
      summary: {
        totalValuation: Math.round((totalValuation + Number.EPSILON) * 100) / 100,
        totalUnits: Math.round((totalUnits + Number.EPSILON) * 10000) / 10000,
        productsCount: rows.length,
      },
      products: rows,
    };
  }
}

