import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryRepository } from './inventory.repository';
import { StockMovementsRepository } from './stock-movements.repository';
import { WarehousesRepository } from './warehouses.repository';
import { DatabaseService } from '../database/database.service';
import { FifoService } from './fifo.service';
import { MovementService, CreateMovementInput } from './movement.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly movementsRepository: StockMovementsRepository,
    private readonly warehousesRepository: WarehousesRepository,
    private readonly db: DatabaseService,
    private readonly fifoService: FifoService,
    private readonly movementService: MovementService,
  ) {}

  async getStats(companyId: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    return this.inventoryRepository.getStats(companyId, branchId, restrictedWarehouseId);
  }

  async getProductTotals(companyId: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    return this.inventoryRepository.getProductTotals(companyId, branchId, restrictedWarehouseId);
  }

  async findAll(
    companyId: string,
    page: number,
    limit: number,
    search: string,
    warehouseId: string,
    status: string,
    branchId?: string | null,
    restrictedWarehouseId?: string | null,
  ) {
    return this.inventoryRepository.findAll(
      companyId,
      page,
      limit,
      search,
      warehouseId,
      status,
      branchId,
      restrictedWarehouseId,
    );
  }

  async findBalances(companyId: string, filters: any) {
    return this.inventoryRepository.findBalances(companyId, filters);
  }

  async findByProduct(companyId: string, productId: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    return this.inventoryRepository.findByProduct(companyId, productId, branchId, restrictedWarehouseId);
  }

  async getProduct360(companyId: string, productId: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    return this.inventoryRepository.getProduct360(companyId, productId, branchId, restrictedWarehouseId);
  }

  async getTraceability(companyId: string, batchId: string, branchId?: string | null) {
    return this.inventoryRepository.getBatchTraceability(companyId, batchId, branchId);
  }

  async getKardex(companyId: string, productId: string, warehouseId?: string | null) {
    return this.inventoryRepository.getEnterpriseKardex(companyId, productId, warehouseId || undefined);
  }

  async getCostLayers(companyId: string, productId?: string, status?: string, warehouseId?: string) {
    return this.fifoService.getCostLayers(companyId, productId, status, warehouseId);
  }

  async getValuation(companyId: string, warehouseId?: string) {
    return this.fifoService.getValuation(companyId, warehouseId);
  }

  async executeMovement(input: CreateMovementInput) {
    return this.movementService.executeMovement(input);
  }

  async createAdjustment(data: {
    inventory_id?: string;
    product_id?: string;
    batch_id?: string;
    movement_type: 'adjustment' | 'write_off' | 'sample';
    quantity_change: number;
    notes: string;
    created_by?: string;
    company_id: string;
    branch_id?: string | null;
    restricted_warehouse_id?: string | null;
    from_warehouse_id?: string;
    from_location_id?: string;
  }) {
    // Si viene product_id y from_warehouse_id, se procesa por el motor inmutable
    if (data.product_id && data.from_warehouse_id && data.from_location_id) {
      const isPositive = data.quantity_change > 0;
      return this.movementService.executeMovement({
        companyId: data.company_id,
        operationType: isPositive ? 'adjustment_positive' : 'adjustment_negative',
        notes: data.notes,
        userId: data.created_by,
        lines: [
          {
            productId: data.product_id,
            lotId: data.batch_id || null,
            fromWarehouseId: isPositive ? null : data.from_warehouse_id,
            fromLocationId: isPositive ? null : data.from_location_id,
            toWarehouseId: isPositive ? data.from_warehouse_id : null,
            toLocationId: isPositive ? data.from_location_id : null,
            quantity: Math.abs(data.quantity_change),
            unitCost: 0,
          },
        ],
      });
    }

    // Flujo legacy por inventory_id
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      const query = `
        SELECT i.quantity, i.storage_location_id, i.warehouse_id, b.product_id 
        FROM inventory i 
        JOIN product_batches b ON b.id = i.batch_id
        JOIN warehouses w ON w.id = i.warehouse_id 
        WHERE i.id = $1 AND w.company_id = $2 
          AND ($3::uuid IS NULL OR w.branch_id = $3) 
          AND ($4::uuid IS NULL OR w.id = $4) 
        FOR UPDATE OF i`;
      const itemRes = await client.query(query, [
        data.inventory_id,
        data.company_id,
        data.branch_id || null,
        data.restricted_warehouse_id || null,
      ]);
      if (itemRes.rows.length === 0) throw new NotFoundException('Elemento de inventario no encontrado.');

      const row = itemRes.rows[0];
      const newQty = Number(row.quantity) + data.quantity_change;
      if (newQty < 0) throw new ConflictException('La cantidad resultante no puede ser negativa.');

      await this.inventoryRepository.updateQuantity(data.inventory_id!, newQty, client);

      const movement = await this.movementsRepository.create(client, {
        inventory_id: data.inventory_id!,
        batch_id: data.batch_id!,
        movement_type: data.movement_type,
        quantity_change: data.quantity_change,
        notes: data.notes,
        created_by: data.created_by,
      });

      // Sincronizar inventory_balances
      await client.query(
        `UPDATE inventory_balances 
         SET physical_stock = $1, last_reconciled_at = CURRENT_TIMESTAMP
         WHERE company_id = $2 AND product_id = $3 AND warehouse_id = $4 AND location_id = $5`,
        [newQty, data.company_id, row.product_id, row.warehouse_id, row.storage_location_id],
      );

      await client.query('COMMIT');
      return movement;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async updateReorderSettings(companyId: string, productId: string, data: { min_stock: number; lead_time_days: number }) {
    return this.inventoryRepository.updateReorderSettings(companyId, productId, data.min_stock, data.lead_time_days);
  }

  async getWarehouses(companyId?: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    return this.warehousesRepository.findAll(companyId, branchId, restrictedWarehouseId);
  }

  async transferStock(data: {
    from_inventory_id: string;
    to_warehouse_id: string;
    quantity: number;
    notes?: string;
    company_id: string;
    branch_id?: string | null;
    restricted_warehouse_id?: string | null;
  }) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      const fromQuery = `
        SELECT i.*, b.product_id 
        FROM inventory i 
        JOIN product_batches b ON b.id = i.batch_id
        JOIN warehouses w ON w.id = i.warehouse_id 
        WHERE i.id = $1 AND i.stock_status = 'available' AND w.company_id = $2 
          AND ($3::uuid IS NULL OR w.branch_id = $3) 
          AND ($4::uuid IS NULL OR w.id = $4) 
        FOR UPDATE OF i`;
      const fromRes = await client.query(fromQuery, [
        data.from_inventory_id,
        data.company_id,
        data.branch_id || null,
        data.restricted_warehouse_id || null,
      ]);
      if (fromRes.rows.length === 0) throw new NotFoundException('Inventario de origen no encontrado.');
      const source = fromRes.rows[0];

      if (Number(source.quantity) < data.quantity) {
        throw new ConflictException('Cantidad insuficiente para transferir.');
      }

      const newSourceQty = Number(source.quantity) - data.quantity;
      await this.inventoryRepository.updateQuantity(source.id, newSourceQty, client);

      const destination = await client.query(
        `SELECT id, code FROM storage_locations WHERE warehouse_id = $1 AND is_default = true AND status = 'active' LIMIT 1 FOR UPDATE`,
        [data.to_warehouse_id],
      );
      if (!destination.rowCount) throw new NotFoundException('La bodega destino no tiene una ubicación predeterminada activa.');

      const targetLocation = destination.rows[0];
      const targetQuery = `
        SELECT * FROM inventory 
        WHERE batch_id = $1 AND warehouse_id = $2 AND storage_location_id = $3 AND stock_status = 'available' 
        FOR UPDATE`;
      const targetRes = await client.query(targetQuery, [source.batch_id, data.to_warehouse_id, targetLocation.id]);

      if (targetRes.rows.length > 0) {
        const newTargetQty = Number(targetRes.rows[0].quantity) + data.quantity;
        await this.inventoryRepository.updateQuantity(targetRes.rows[0].id, newTargetQty, client);
      } else {
        await client.query(
          `INSERT INTO inventory (batch_id, warehouse_id, storage_location_id, quantity, bin_location, stock_status)
           VALUES ($1, $2, $3, $4, $5, 'available')`,
          [source.batch_id, data.to_warehouse_id, targetLocation.id, data.quantity, targetLocation.code],
        );
      }

      // Sincronizar inventory_balances
      await client.query(
        `UPDATE inventory_balances 
         SET physical_stock = GREATEST(0, physical_stock - $1), last_reconciled_at = CURRENT_TIMESTAMP
         WHERE company_id = $2 AND product_id = $3 AND warehouse_id = $4 AND location_id = $5`,
        [data.quantity, data.company_id, source.product_id, source.warehouse_id, source.storage_location_id],
      );

      await client.query(
        `INSERT INTO inventory_balances (company_id, product_id, warehouse_id, location_id, lot_id, physical_stock, last_reconciled_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (company_id, product_id, warehouse_id, location_id, lot_id)
         DO UPDATE SET physical_stock = inventory_balances.physical_stock + EXCLUDED.physical_stock, last_reconciled_at = CURRENT_TIMESTAMP`,
        [data.company_id, source.product_id, data.to_warehouse_id, targetLocation.id, source.batch_id, data.quantity],
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getForecasting(companyId: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    return this.inventoryRepository.getForecastingReport(companyId, branchId, restrictedWarehouseId);
  }

  // ─── CONTEOS FÍSICOS Y CONGELAMIENTO TRANSACCIONAL ───────────────────────

  async listCounts(companyId: string, warehouseId?: string) {
    return this.inventoryRepository.listCounts(companyId, warehouseId);
  }

  async getCount(companyId: string, id: string) {
    return this.inventoryRepository.getCount(companyId, id);
  }

  async createCount(companyId: string, userId: string, data: any) {
    return this.inventoryRepository.createCount(companyId, userId, data);
  }

  async updateCountLines(companyId: string, countId: string, userId: string, lines: any[]) {
    return this.inventoryRepository.updateCountLines(companyId, countId, userId, lines);
  }

  async reconcileCount(companyId: string, countId: string, userId: string, notes?: string) {
    const count = await this.inventoryRepository.getCount(companyId, countId);
    if (count.status === 'reconciled') {
      throw new ConflictException('Este conteo físico ya fue conciliado.');
    }

    const varianceLines = count.lines.filter((l: any) => Number(l.variance || 0) !== 0);

    // Si existen diferencias, aplicar movimientos compensatorios automáticos
    if (varianceLines.length > 0) {
      // 1. Agrupar sobrantes (+) y faltantes (-)
      const positives = varianceLines.filter((l: any) => Number(l.variance) > 0);
      const negatives = varianceLines.filter((l: any) => Number(l.variance) < 0);

      if (positives.length > 0) {
        await this.movementService.executeMovement({
          companyId,
          operationType: 'adjustment_positive',
          referenceDocType: 'inventory_count',
          referenceDocId: count.id,
          notes: `Conciliación conteo ${count.count_number} - Sobrantes físicos`,
          userId,
          lines: positives.map((l: any) => ({
            productId: l.product_id,
            lotId: l.lot_id,
            toWarehouseId: count.warehouse_id,
            toLocationId: l.location_id,
            quantity: Number(l.variance),
            unitCost: Number(l.unit_cost_fifo || 0),
          })),
        });
      }

      if (negatives.length > 0) {
        await this.movementService.executeMovement({
          companyId,
          operationType: 'adjustment_negative',
          referenceDocType: 'inventory_count',
          referenceDocId: count.id,
          notes: `Conciliación conteo ${count.count_number} - Faltantes físicos`,
          userId,
          lines: negatives.map((l: any) => ({
            productId: l.product_id,
            lotId: l.lot_id,
            fromWarehouseId: count.warehouse_id,
            fromLocationId: l.location_id,
            quantity: Math.abs(Number(l.variance)),
          })),
        });
      }
    }

    // Liberar congelamiento transaccional temporal de las ubicaciones auditadas
    await this.db.query(
      `UPDATE inventory_balances b
       SET blocked_stock = GREATEST(0, b.blocked_stock - cl.expected_quantity)
       FROM inventory_count_lines cl
       WHERE cl.count_id = $1
         AND b.company_id = $2
         AND b.product_id = cl.product_id
         AND b.location_id = cl.location_id
         AND (b.lot_id = cl.lot_id OR (cl.lot_id IS NULL AND b.lot_id IS NULL))`,
      [countId, companyId],
    );

    // Actualizar estado a reconciliado en la base de datos
    await this.db.query(
      `UPDATE inventory_counts
       SET status = 'reconciled', reconciled_by = $1, reconciled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND company_id = $3`,
      [userId, countId, companyId],
    );

    return this.getCount(companyId, countId);
  }
}
