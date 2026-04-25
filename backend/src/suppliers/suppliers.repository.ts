import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SuppliersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    // Obtenemos proveedores con una métrica rápida de importaciones realizadas
    const res = await this.db.query(`
      SELECT s.*, 
             COUNT(i.id) as total_imports,
             COALESCE(SUM(i.total_cost), 0) as total_purchased
      FROM suppliers s
      LEFT JOIN imports i ON s.id = i.supplier_id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    return res.rows;
  }

  async findById(id: string) {
    const res = await this.db.query('SELECT * FROM suppliers WHERE id = $1', [id]);
    return res.rows[0];
  }

  async create(supplier: any) {
    const { 
      name, country, contact_person, email, phone,
      incoterm_default, shipping_port, estimated_lead_time,
      payment_terms, brands_handled, website
    } = supplier;
    
    const res = await this.db.query(
      `INSERT INTO suppliers (
        name, country, contact_person, email, phone,
        incoterm_default, shipping_port, estimated_lead_time,
        payment_terms, brands_handled, website
      ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        name, country, contact_person, email, phone,
        incoterm_default || 'FOB', shipping_port || null, estimated_lead_time || 30,
        payment_terms || null, brands_handled || null, website || null
      ]
    );
    return res.rows[0];
  }

  async update(id: string, supplier: any) {
    const { 
      name, country, contact_person, email, phone,
      incoterm_default, shipping_port, estimated_lead_time,
      payment_terms, brands_handled, website
    } = supplier;

    const res = await this.db.query(
      `UPDATE suppliers SET
        name = $1, country = $2, contact_person = $3, email = $4, phone = $5,
        incoterm_default = $6, shipping_port = $7, estimated_lead_time = $8,
        payment_terms = $9, brands_handled = $10, website = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12 RETURNING *`,
      [
        name, country, contact_person, email, phone,
        incoterm_default, shipping_port, estimated_lead_time,
        payment_terms, brands_handled, website, id
      ]
    );
    return res.rows[0];
  }
}
