import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ImportsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll(companyId: string) {
    const res = await this.db.query(`
      SELECT i.*, s.name as supplier_name 
      FROM imports i
      JOIN suppliers s ON i.supplier_id = s.id AND s.company_id = i.company_id
      WHERE i.company_id = $1
      ORDER BY i.import_date DESC
    `, [companyId]);
    return res.rows;
  }

  async findById(companyId: string, id: string) {
    const res = await this.db.query(`
      SELECT i.*, s.name as supplier_name 
      FROM imports i
      JOIN suppliers s ON i.supplier_id = s.id AND s.company_id = i.company_id
      WHERE i.id = $1 AND i.company_id = $2
    `, [id, companyId]);
    return res.rows[0];
  }

  async getActiveContainers(companyId: string) {
    const res = await this.db.query(`
      SELECT ic.*, i.bl_number, s.name as supplier_name
      FROM import_containers ic
      JOIN imports i ON ic.import_id = i.id AND i.company_id = $1
      JOIN suppliers s ON i.supplier_id = s.id AND s.company_id = i.company_id
      WHERE ic.customs_status != 'Retirado'
      ORDER BY ic.free_days_deadline ASC
    `, [companyId]);
    return res.rows;
  }

  async getContainersAlerts(companyId: string) {
    const res = await this.db.query(`
      SELECT ic.*, i.bl_number, s.name as supplier_name
      FROM import_containers ic
      JOIN imports i ON ic.import_id = i.id AND i.company_id = $1
      JOIN suppliers s ON i.supplier_id = s.id AND s.company_id = i.company_id
      WHERE ic.customs_status != 'Retirado' 
        AND (
          ic.free_days_deadline <= CURRENT_DATE + INTERVAL '3 days' 
          OR ic.customs_status = 'Aforo Físico'
        )
      ORDER BY ic.free_days_deadline ASC
    `, [companyId]);
    return res.rows;
  }

  async createTransaction(importData: any,companyId:string,userId:string) {
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
      const supplier=await client.query('SELECT id FROM suppliers WHERE id=$1 AND company_id=$2',[supplier_id,companyId]);if(!supplier.rowCount)throw new BadRequestException('El proveedor no pertenece a esta empresa.');

      // 1. Cabecera (Imports Header)
      const importRes = await client.query(
        `INSERT INTO imports (
          company_id,supplier_id, import_date, country, shipping_cost, tax_cost, total_cost,
          status, bl_number, tracking_number, estimated_arrival, actual_arrival,
          fob_value, freight_cost, insurance_cost, customs_taxes, arcsa_taxes, exchange_rate,
          incoterm, courier, fodinfa_cost, iva_cost
        )
         VALUES ($1,$2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING *`,
        [
          companyId,supplier_id, toDate(import_date), country, Number(shipping_cost) || 0, Number(tax_cost) || 0, Number(total_cost) || 0,
          status || 'PENDING', bl_number || null, tracking_number || null, toDate(estimated_arrival), toDate(actual_arrival),
          Number(fob_value) || 0, Number(freight_cost) || 0, Number(insurance_cost) || 0, Number(customs_taxes) || 0, Number(arcsa_taxes) || 0, Number(exchange_rate) || 1,
          incoterm || null, courier || null, Number(fodinfa_cost) || 0, Number(iva_cost) || 0
        ]
      );
      const newImport = importRes.rows[0];

      // 2. Conservamos las líneas esperadas. El inventario se genera al cerrar su recepción.
      if (items && items.length > 0) {
        // Calcular costo unitario prorrateado simple para todos los items
        const totalUnits = items.reduce((sum: number, item: any) => sum + (parseInt(item.quantity, 10) || 0), 0);
        const unitCost = totalUnits > 0 ? (Number(total_cost) / totalUnits) : 0;

        for (const item of items) {
          const product=await client.query('SELECT id FROM products WHERE id=$1 AND company_id=$2 AND archived_at IS NULL',[item.product_id,companyId]);if(!product.rowCount)throw new BadRequestException('Un producto de la importación no pertenece a esta empresa o está archivado.');
          const sourcing=await client.query(`SELECT id,supplier_product_code FROM product_suppliers WHERE company_id=$1 AND product_id=$2 AND supplier_id=$3 AND valid_from<=$4::date AND (valid_until IS NULL OR valid_until>=$4::date) ORDER BY is_preferred DESC,valid_from DESC LIMIT 1`,[companyId,item.product_id,supplier_id,toDate(import_date)||new Date().toISOString().slice(0,10)]);
          const classification=await client.query(`SELECT id,tariff_heading,tariff_subheading FROM product_import_classifications WHERE company_id=$1 AND product_id=$2 AND review_status='approved' AND valid_from<=$3::date AND (valid_until IS NULL OR valid_until>=$3::date) ORDER BY valid_from DESC,reviewed_at DESC LIMIT 1`,[companyId,item.product_id,toDate(import_date)||new Date().toISOString().slice(0,10)]);
          await client.query(
            `INSERT INTO import_items (import_id, product_id, expected_quantity, unit_cost, batch_number, expiration_date, suggested_location,product_supplier_id,supplier_product_code_snapshot,import_classification_id,tariff_heading_snapshot,tariff_subheading_snapshot)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [newImport.id,item.product_id,parseInt(item.quantity,10)||0,unitCost,item.batch_number||null,toDate(item.expiration_date),item.warehouse_location||null,sourcing.rows[0]?.id||null,sourcing.rows[0]?.supplier_product_code||null,classification.rows[0]?.id||null,classification.rows[0]?.tariff_heading||null,classification.rows[0]?.tariff_subheading||null]
          );
        }
      }

      await client.query('COMMIT');
      return newImport;
    } catch (error) {
      await client.query('ROLLBACK');
      if(error instanceof BadRequestException)throw error;
      console.error('=== TRANSACTION FAILED ===', error);
      throw new InternalServerErrorException(`DB Error: ${(error as any).message}`);
    } finally {
      client.release();
    }
  }

  async getImportDetail(companyId: string, id: string) {
    const importRes = await this.db.query(`
      SELECT i.*, s.name as supplier_name 
      FROM imports i
      JOIN suppliers s ON i.supplier_id = s.id AND s.company_id = i.company_id
      WHERE i.id = $1 AND i.company_id = $2
    `, [id, companyId]);
    
    if (importRes.rows.length === 0) return null;
    const shipment = importRes.rows[0];

    const itemsRes = await this.db.query(`
      SELECT ii.*, ii.expected_quantity AS quantity, p.name AS product_name, p.sku,
        ii.suggested_location AS warehouse_location
      FROM import_items ii
      JOIN imports i ON i.id = ii.import_id AND i.company_id = $2
      JOIN products p ON p.id = ii.product_id AND p.company_id = i.company_id
      WHERE ii.import_id = $1 ORDER BY ii.created_at
    `, [id, companyId]);

    const containersRes = await this.db.query(`
      SELECT ic.* FROM import_containers ic
      JOIN imports i ON i.id = ic.import_id
      WHERE ic.import_id = $1 AND i.company_id = $2
    `, [id, companyId]);

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

  async updateStatus(companyId: string, id: string, status: string) {
    const res = await this.db.query(`
      UPDATE imports 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND company_id = $3
      RETURNING *
    `, [status, id, companyId]);
    if (!res.rowCount) throw new NotFoundException('Importación no encontrada para esta empresa.');
    return res.rows[0];
  }

  async updateArrival(companyId: string, id: string, actual_arrival: string) {
    const res = await this.db.query(`
      UPDATE imports 
      SET actual_arrival = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND company_id = $3
      RETURNING *
    `, [actual_arrival, id, companyId]);
    if (!res.rowCount) throw new NotFoundException('Importación no encontrada para esta empresa.');
    return res.rows[0];
  }

  async updateContainer(companyId: string, id: string, customs_status: string, free_days_deadline: string) {
    const res = await this.db.query(`
      UPDATE import_containers ic
      SET customs_status = $1, free_days_deadline = $2, updated_at = CURRENT_TIMESTAMP
      WHERE ic.id = $3
        AND EXISTS (SELECT 1 FROM imports i WHERE i.id = ic.import_id AND i.company_id = $4)
      RETURNING ic.*
    `, [customs_status, free_days_deadline, id, companyId]);
    if (!res.rowCount) throw new NotFoundException('Contenedor no encontrado para esta empresa.');
    return res.rows[0];
  }
}
