import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class InventoryRepository {
  constructor(private readonly db: DatabaseService) {}

  async getStats() {
    const query = `
      WITH product_totals AS (
        SELECT 
          p.id, 
          p.min_stock, 
          SUM(i.quantity) as total_quantity
        FROM products p
        LEFT JOIN product_batches b ON p.id = b.product_id
        LEFT JOIN inventory i ON b.id = i.batch_id
        GROUP BY p.id, p.min_stock
      )
      SELECT 
        (SELECT COUNT(*) FROM inventory i JOIN product_batches b ON i.batch_id = b.id WHERE b.expiration_date < CURRENT_DATE) as expired,
        (SELECT COUNT(*) FROM inventory i JOIN product_batches b ON i.batch_id = b.id WHERE b.expiration_date >= CURRENT_DATE AND b.expiration_date <= CURRENT_DATE + INTERVAL '90 days') as critical,
        (SELECT COUNT(*) FROM product_totals WHERE total_quantity <= min_stock) as low_stock_count,
        (SELECT COALESCE(SUM(quantity), 0) FROM inventory) as total_quantity,
        (SELECT COALESCE(SUM(i.quantity * b.unit_cost), 0) FROM inventory i JOIN product_batches b ON i.batch_id = b.id) as total_valuation,
        (SELECT COUNT(*) FROM inventory) as total_items
    `;
    const res = await this.db.query(query);
    const row = res.rows[0];
    return {
      total: Number(row.total_items),
      expired: Number(row.expired),
      critical: Number(row.critical),
      lowStockCount: Number(row.low_stock_count),
      totalQuantity: Number(row.total_quantity),
      totalValuation: Number(row.total_valuation)
    };
  }

  async findAll(page: number = 1, limit: number = 50, search: string = '', warehouseId: string = '', status: string = '') {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let whereClauses: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR b.batch_number ILIKE $${params.length})`);
    }

    if (warehouseId) {
      params.push(warehouseId);
      whereClauses.push(`w.id = $${params.length}`);
    }

    if (status === 'critical') {
      whereClauses.push(`b.expiration_date >= CURRENT_DATE AND b.expiration_date <= CURRENT_DATE + INTERVAL '90 days'`);
    } else if (status === 'expired') {
      whereClauses.push(`b.expiration_date < CURRENT_DATE`);
    } else if (status === 'healthy') {
      whereClauses.push(`b.expiration_date > CURRENT_DATE + INTERVAL '90 days'`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) 
      FROM inventory i
      JOIN product_batches b ON i.batch_id = b.id
      JOIN products p ON b.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      ${whereString}
    `;

    const dataQuery = `
      SELECT 
        i.id as inventory_id, i.quantity, i.bin_location, 
        b.batch_number, b.expiration_date, b.id as batch_id, b.unit_cost,
        p.name as product_name, p.sku, p.brand, p.id as product_id,
        p.min_stock, p.lead_time_days,
        w.name as warehouse_name, w.id as warehouse_id, w.type as warehouse_type
      FROM inventory i
      JOIN product_batches b ON i.batch_id = b.id
      JOIN products p ON b.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      ${whereString}
      ORDER BY b.expiration_date ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countParams = [...params];
    params.push(limit, offset);

    const [countResult, dataResult] = await Promise.all([
      this.db.query(countQuery, countParams),
      this.db.query(dataQuery, params)
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
      data: dataResult.rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findByProduct(productId: string) {
    const query = `
      SELECT 
        i.id as inventory_id, i.quantity, i.bin_location, 
        b.batch_number, b.expiration_date,
        w.name as warehouse_name
      FROM inventory i
      JOIN product_batches b ON i.batch_id = b.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE b.product_id = $1
      ORDER BY b.expiration_date ASC
    `;
    const result = await this.db.query(query, [productId]);
    return result.rows;
  }

  async getBatchTraceability(batchId: string) {
    const query = `
      SELECT 
        s.sale_number, s.sale_date, si.quantity as quantity_delivered,
        c.name as customer_name, c.phone as customer_phone, c.business_name
      FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN customers c ON s.customer_id = c.id
      WHERE si.batch_id = $1
      ORDER BY s.sale_date DESC
    `;
    const result = await this.db.query(query, [batchId]);
    return result.rows;
  }

  async updateQuantity(inventoryId: string, newQuantity: number, client?: any) {
    const query = `UPDATE inventory SET quantity = $1, last_updated = NOW() WHERE id = $2 RETURNING *`;
    const params = [newQuantity, inventoryId];
    const res = client ? await client.query(query, params) : await this.db.query(query, params);
    return res.rows[0];
  }

  async updateReorderSettings(productId: string, minStock: number, lead_time_days: number) {
    const query = `UPDATE products SET min_stock = $1, lead_time_days = $2 WHERE id = $3 RETURNING *`;
    const res = await this.db.query(query, [minStock, lead_time_days, productId]);
    return res.rows[0];
  }

  async getForecastingReport() {
    // 1. Calculate sales velocity per product (last 30 days)
    // 2. Join with current inventory and product lead times
    const query = `
      WITH product_sales AS (
        SELECT 
          pb.product_id,
          SUM(si.quantity) as total_sold_30d,
          (SUM(si.quantity) / 30.0) as ads -- Average Daily Sales
        FROM sales_items si
        JOIN product_batches pb ON si.batch_id = pb.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY pb.product_id
      ),
      current_inventory AS (
        SELECT 
          pb.product_id,
          SUM(i.quantity) as total_stock
        FROM inventory i
        JOIN product_batches pb ON i.batch_id = pb.id
        GROUP BY pb.product_id
      )
    SELECT 
      p.id as product_id,
      p.name as product_name,
      p.sku,
      p.lead_time_days,
      COALESCE(ci.total_stock, 0) as current_stock,
      COALESCE(ps.ads, 0) as ads,
      COALESCE(ps.total_sold_30d, 0) as total_sold_30d,
      CASE 
        WHEN COALESCE(ps.ads, 0) > 0 THEN (COALESCE(ci.total_stock, 0) / ps.ads)
        ELSE 999 
      END as days_left
    FROM products p
    LEFT JOIN product_sales ps ON p.id = ps.product_id
    LEFT JOIN current_inventory ci ON p.id = ci.product_id
    WHERE p.is_active = true
    ORDER BY (CASE WHEN COALESCE(ps.ads, 0) > 0 THEN (COALESCE(ci.total_stock, 0) / ps.ads) ELSE 999 END) ASC
    `;
    const res = await this.db.query(query);
    return res.rows;
  }
}
