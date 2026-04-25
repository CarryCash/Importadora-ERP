import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class QuotesRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(dto: any) {
    const { customer_id, user_id, items, valid_until, notes, discount = 0, tax = 0 } = dto;
    const client = await (this.db as any).pool.connect();
    
    try {
      await client.query('BEGIN');

      // Generar secuencial COT-YYYY-NNNN
      const year = new Date().getFullYear();
      const countRes = await client.query('SELECT COUNT(*) FROM quotes WHERE EXTRACT(YEAR FROM created_at) = $1', [year]);
      const seq = (parseInt(countRes.rows[0].count) + 1).toString().padStart(4, '0');
      const quoteNumber = `COT-${year}-${seq}`;

      let subtotal = 0;
      for (const item of items) {
        subtotal += item.quantity * item.unit_price;
      }

      const discountAmount = subtotal * (discount / 100);
      const taxAmount = (subtotal - discountAmount) * (tax / 100);
      const totalAmount = subtotal - discountAmount + taxAmount;

      const quoteRes = await client.query(
        `INSERT INTO quotes (quote_number, customer_id, user_id, valid_until, status, subtotal, discount, tax, total_amount, notes)
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9)
         RETURNING *`,
        [quoteNumber, customer_id, user_id, valid_until, subtotal, discount, tax, totalAmount, notes]
      );
      const quoteId = quoteRes.rows[0].id;

      for (const item of items) {
        const itemTotal = (item.quantity * item.unit_price) * (1 - (item.discount || 0) / 100);
        await client.query(
          `INSERT INTO quote_items (quote_id, product_id, quantity, unit_price, discount, total_amount)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [quoteId, item.product_id, item.quantity, item.unit_price, item.discount || 0, itemTotal]
        );
      }

      await client.query('COMMIT');
      return quoteRes.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findAll() {
    const res = await this.db.query(`
      SELECT q.*, c.name as customer_name 
      FROM quotes q 
      LEFT JOIN customers c ON q.customer_id = c.id 
      ORDER BY q.created_at DESC
    `);
    return res.rows;
  }
}
