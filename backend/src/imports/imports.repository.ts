import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ImportsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query(`
      SELECT i.*, s.name as supplier_name 
      FROM imports i
      JOIN suppliers s ON i.supplier_id = s.id
      ORDER BY i.import_date DESC
    `);
    return res.rows;
  }

  async findById(id: string) {
    const res = await this.db.query(`
      SELECT i.*, s.name as supplier_name 
      FROM imports i
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = $1
    `, [id]);
    return res.rows[0];
  }

  async getActiveContainers() {
    const res = await this.db.query(`
      SELECT ic.*, i.bl_number, s.name as supplier_name
      FROM import_containers ic
      JOIN imports i ON ic.import_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE ic.customs_status != 'Retirado'
      ORDER BY ic.free_days_deadline ASC
    `);
    return res.rows;
  }

  async getContainersAlerts() {
    const res = await this.db.query(`
      SELECT ic.*, i.bl_number, s.name as supplier_name
      FROM import_containers ic
      JOIN imports i ON ic.import_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE ic.customs_status != 'Retirado' 
        AND (
          ic.free_days_deadline <= CURRENT_DATE + INTERVAL '3 days' 
          OR ic.customs_status = 'Aforo Físico'
        )
      ORDER BY ic.free_days_deadline ASC
    `);
    return res.rows;
  }

  async createTransaction(importData: any) {
    const client = await (this.db as any).pool.connect();
    
    try {
      await client.query('BEGIN');

      const { 
        supplier_id, 
        import_date, 
        country, 
        shipping_cost, 
        tax_cost, 
        total_cost,
        status,
        bl_number,
        tracking_number,
        estimated_arrival,
        actual_arrival,
        fob_value,
        freight_cost,
        insurance_cost,
        customs_taxes,
        arcsa_taxes,
        exchange_rate,
        incoterm,
        courier,
        fodinfa_cost,
        iva_cost,
        items 
      } = importData;

      const toDate = (v: any) => (v && String(v).trim() !== '' ? v : null);

      // 1. Cabecera (Imports Header)
      const importRes = await client.query(
        `INSERT INTO imports (
          supplier_id, import_date, country, shipping_cost, tax_cost, total_cost,
          status, bl_number, tracking_number, estimated_arrival, actual_arrival,
          fob_value, freight_cost, insurance_cost, customs_taxes, arcsa_taxes, exchange_rate,
          incoterm, courier, fodinfa_cost, iva_cost
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING *`,
        [
          supplier_id, toDate(import_date), country, Number(shipping_cost) || 0, Number(tax_cost) || 0, Number(total_cost) || 0,
          status || 'PENDING', bl_number || null, tracking_number || null, toDate(estimated_arrival), toDate(actual_arrival),
          Number(fob_value) || 0, Number(freight_cost) || 0, Number(insurance_cost) || 0, Number(customs_taxes) || 0, Number(arcsa_taxes) || 0, Number(exchange_rate) || 1,
          incoterm || null, courier || null, Number(fodinfa_cost) || 0, Number(iva_cost) || 0
        ]
      );
      const newImport = importRes.rows[0];

      // 2. Registramos los lotes y el inventario
      if (items && items.length > 0) {
        // Calcular costo unitario prorrateado simple para todos los items
        const totalUnits = items.reduce((sum: number, item: any) => sum + (parseInt(item.quantity, 10) || 0), 0);
        const unitCost = totalUnits > 0 ? (Number(total_cost) / totalUnits) : 0;

        for (const item of items) {
          const batchRes = await client.query(
            `INSERT INTO product_batches (product_id, batch_number, manufacturing_date, expiration_date, import_id, unit_cost)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [item.product_id, item.batch_number, toDate(item.manufacturing_date), toDate(item.expiration_date), newImport.id, unitCost]
          );
          const newBatch = batchRes.rows[0];

          let targetWarehouseId = item.warehouse_id;
          if (!targetWarehouseId) {
            const transitWh = await client.query("SELECT id FROM warehouses WHERE code = 'WH-TRANSIT'");
            targetWarehouseId = transitWh.rows[0].id;
          }

          await client.query(
            `INSERT INTO inventory (batch_id, quantity, warehouse_id, bin_location)
             VALUES ($1, $2, $3, $4)`,
             [newBatch.id, parseInt(item.quantity, 10) || 0, targetWarehouseId, item.bin_location || 'Ingreso Importación']
          );
        }
      }

      await client.query('COMMIT');
      return newImport;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('=== TRANSACTION FAILED ===', error);
      throw new InternalServerErrorException(`DB Error: ${(error as any).message}`);
    } finally {
      client.release();
    }
  }

  async getImportDetail(id: string) {
    const importRes = await this.db.query(`
      SELECT i.*, s.name as supplier_name 
      FROM imports i
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = $1
    `, [id]);
    
    if (importRes.rows.length === 0) return null;
    const shipment = importRes.rows[0];

    const itemsRes = await this.db.query(`
      SELECT pb.*, p.name as product_name, p.sku, inv.quantity, inv.bin_location as warehouse_location
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      JOIN inventory inv ON inv.batch_id = pb.id
      WHERE pb.import_id = $1
    `, [id]);

    const containersRes = await this.db.query(`
      SELECT * FROM import_containers WHERE import_id = $1
    `, [id]);

    return {
      ...shipment,
      containers: containersRes.rows,
      items: itemsRes.rows.map(item => {
        // En un futuro se puede hacer un prorrateo más complejo basado en peso o volumen
        // Por ahora usamos el costo unitario guardado o lo recalculamos
        const totalUnits = itemsRes.rows.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
        const unitLandedCost = totalUnits > 0 ? (shipment.total_cost / totalUnits) : 0;
        return {
          ...item,
          unit_landed_cost: unitLandedCost,
          suggested_sale_price: unitLandedCost * 1.4
        };
      })
    };
  }

  async updateStatus(id: string, status: string) {
    const res = await this.db.query(`
      UPDATE imports 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, id]);
    return res.rows[0];
  }

  async updateArrival(id: string, actual_arrival: string) {
    const res = await this.db.query(`
      UPDATE imports 
      SET status = 'WAREHOUSE', actual_arrival = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [actual_arrival, id]);
    return res.rows[0];
  }

  async updateContainer(id: string, customs_status: string, free_days_deadline: string) {
    const res = await this.db.query(`
      UPDATE import_containers
      SET customs_status = $1, free_days_deadline = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [customs_status, free_days_deadline, id]);
    return res.rows[0];
  }
}
