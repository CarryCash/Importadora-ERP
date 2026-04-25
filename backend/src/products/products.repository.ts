import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const result = await this.db.query('SELECT * FROM products ORDER BY created_at DESC');
    return result.rows;
  }

  async findById(id: string) {
    const result = await this.db.query('SELECT * FROM products WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async create(product: any) {
    const { 
      name, description, price, brand, category, 
      cost_price, sale_price, product_type, sanitary_registration, sku,
      min_stock, lead_time_days
    } = product;
    
    const result = await this.db.query(
      `INSERT INTO products 
        (name, description, price, brand, category, cost_price, sale_price, product_type, sanitary_registration, sku, min_stock, lead_time_days) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [name, description, price, brand, category, cost_price, sale_price, product_type, sanitary_registration, sku, min_stock || 20, lead_time_days || 45]
    );
    
    return result.rows[0];
  }
}
