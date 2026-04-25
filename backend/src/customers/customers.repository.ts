import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CustomersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query(`
      SELECT 
        c.*,
        (SELECT MAX(sale_date) FROM sales WHERE customer_id = c.id AND status != 'cancelled') as last_order_date,
        COALESCE((
          SELECT SUM(s.total_amount) - (SELECT COALESCE(SUM(p.amount), 0) FROM sale_payments p JOIN sales s2 ON p.sale_id = s2.id WHERE s2.customer_id = c.id AND s2.status != 'cancelled')
          FROM sales s WHERE s.customer_id = c.id AND s.status != 'cancelled'
        ), 0) as balance
      FROM customers c 
      ORDER BY c.created_at DESC
    `);
    return res.rows;
  }

  async getStatement(id: string) {
    const res = await this.db.query(`
      SELECT 
        s.id, s.sale_number, s.sale_date, s.total_amount, s.payment_status,
        COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_id = s.id), 0) as paid_amount
      FROM sales s
      WHERE s.customer_id = $1 AND s.status != 'cancelled' AND s.payment_status != 'paid'
      ORDER BY s.sale_date ASC
    `, [id]);
    return res.rows;
  }

  async findById(id: string) {
    const res = await this.db.query('SELECT * FROM customers WHERE id = $1', [id]);
    return res.rows[0];
  }

  async create(customer: any) {
    const { 
      name, email, phone, address, 
      identification_type, identification_number, business_name,
      customer_type, credit_limit, payment_terms, province, city, sri_regime,
      price_list_level, default_discount, visit_days, latitude, longitude, special_notes
    } = customer;
    
    const res = await this.db.query(
      `INSERT INTO customers (
        name, email, phone, address, 
        identification_type, identification_number, business_name,
        customer_type, credit_limit, payment_terms, province, city, sri_regime,
        price_list_level, default_discount, visit_days, latitude, longitude, special_notes
      ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) 
       RETURNING *`,
      [
        name, email, phone, address, 
        identification_type, identification_number, business_name,
        customer_type, credit_limit || 0, payment_terms || 0, 
        province, city, sri_regime,
        price_list_level || 'Público', default_discount || 0, visit_days,
        latitude, longitude, special_notes
      ]
    );
    return res.rows[0];
  }

  async update(id: string, customer: any) {
    const { 
      name, email, phone, address, 
      identification_type, identification_number, business_name,
      customer_type, credit_limit, payment_terms, province, city, sri_regime,
      price_list_level, default_discount, visit_days, latitude, longitude, special_notes
    } = customer;

    const res = await this.db.query(
      `UPDATE customers SET 
        name = COALESCE($1, name), 
        email = COALESCE($2, email), 
        phone = COALESCE($3, phone), 
        address = COALESCE($4, address),
        identification_type = COALESCE($5, identification_type),
        identification_number = COALESCE($6, identification_number),
        business_name = COALESCE($7, business_name),
        customer_type = COALESCE($8, customer_type),
        credit_limit = COALESCE($9, credit_limit),
        payment_terms = COALESCE($10, payment_terms),
        province = COALESCE($11, province),
        city = COALESCE($12, city),
        sri_regime = COALESCE($13, sri_regime),
        price_list_level = COALESCE($14, price_list_level),
        default_discount = COALESCE($15, default_discount),
        visit_days = COALESCE($16, visit_days),
        latitude = COALESCE($17, latitude),
        longitude = COALESCE($18, longitude),
        special_notes = COALESCE($19, special_notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $20 RETURNING *`,
      [
        name, email, phone, address, 
        identification_type, identification_number, business_name,
        customer_type, credit_limit, payment_terms, province, city, sri_regime,
        price_list_level, default_discount, visit_days,
        latitude, longitude, special_notes,
        id
      ]
    );
    return res.rows[0];
  }

  async delete(id: string) {
    await this.db.query('DELETE FROM customers WHERE id = $1', [id]);
    return { success: true };
  }
}
