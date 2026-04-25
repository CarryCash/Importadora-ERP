import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  async getDashboardData() {
    const [
      revenue, 
      salesToday, 
      criticalBatches, 
      lowStock, 
      inTransitImports, 
      pendingOrders,
      topSellers,
      topProducts,
      pendingQuotes,
      topCustomers,
      debtors,
      inactiveCustomers,
      topSuppliers,
      avgLeadTimes,
      upcomingImports,
      weeklyFlow
    ] = await Promise.all([
      this.getTotalRevenue(),
      this.getSalesToday(),
      this.getCriticalBatches(),
      this.getLowStockProducts(),
      this.getInTransitImports(),
      this.getPendingOrders(),
      this.getTopSellers(),
      this.getTopProducts(),
      this.getPendingQuotes(),
      this.getTopCustomers(),
      this.getDebtors(),
      this.getInactiveCustomers(),
      this.getTopSuppliers(),
      this.getAvgLeadTimes(),
      this.getUpcomingImports(),
      this.getWeeklyFlow()
    ]);

    return {
      totalRevenue: revenue,
      salesToday: salesToday,
      criticalBatches: criticalBatches,
      lowStockProducts: lowStock,
      inTransitImports: inTransitImports,
      pendingOrders: pendingOrders,
      topSellers: topSellers,
      topProducts: topProducts,
      pendingQuotes: pendingQuotes,
      topCustomers: topCustomers,
      debtors: debtors,
      inactiveCustomers: inactiveCustomers,
      topSuppliers: topSuppliers,
      avgLeadTimes: avgLeadTimes,
      upcomingImports: upcomingImports,
      weeklyFlow: weeklyFlow
    };
  }

  private async getTotalRevenue() {
    const result = await this.db.query('SELECT COALESCE(SUM(total_amount), 0) as total_revenue FROM sales WHERE status != \'cancelled\'');
    return parseFloat(result.rows[0].total_revenue);
  }

  private async getSalesToday() {
    const result = await this.db.query('SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE sale_date = CURRENT_DATE AND status != \'cancelled\'');
    return parseFloat(result.rows[0].total);
  }

  private async getPendingOrders() {
    const result = await this.db.query('SELECT COUNT(*)::int as count FROM sales WHERE status = \'completed\' AND sale_date >= CURRENT_DATE - INTERVAL \'2 days\'');
    return result.rows[0].count;
  }

  private async getInTransitImports() {
    const result = await this.db.query('SELECT COUNT(*)::int as count FROM imports WHERE status IN (\'IN_TRANSIT\', \'CUSTOMS\')');
    return result.rows[0].count;
  }

  private async getTopSellers() {
    const result = await this.db.query(`
      SELECT u.username, u.full_name, COUNT(s.id)::int as sales_count, SUM(s.total_amount) as total_sold
      FROM sales s
      JOIN users u ON s.user_id = u.id
      WHERE s.status != 'cancelled'
      GROUP BY u.id, u.username, u.full_name
      ORDER BY total_sold DESC
      LIMIT 5
    `);
    return result.rows;
  }

  private async getTopProducts() {
    const result = await this.db.query(`
      SELECT p.name, p.sku, SUM(si.quantity)::int as total_qty, SUM(si.total_amount) as total_revenue
      FROM sales_items si
      JOIN product_batches pb ON si.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_qty DESC
      LIMIT 5
    `);
    return result.rows;
  }

  private async getPendingQuotes() {
    const result = await this.db.query(`
      SELECT q.*, c.name as customer_name
      FROM quotes q
      JOIN customers c ON q.customer_id = c.id
      WHERE q.status = 'PENDING'
      ORDER BY q.created_at DESC
      LIMIT 5
    `);
    return result.rows;
  }

  private async getTopCustomers() {
    const result = await this.db.query(`
      SELECT c.name, COUNT(s.id)::int as orders_count, SUM(s.total_amount) as total_spent
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      WHERE s.status != 'cancelled'
      GROUP BY c.id, c.name
      ORDER BY total_spent DESC
      LIMIT 5
    `);
    return result.rows;
  }

  private async getDebtors() {
    const result = await this.db.query(`
      SELECT c.name, SUM(s.total_amount - COALESCE(p.paid_amount, 0)) as total_debt
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      LEFT JOIN (
        SELECT sale_id, SUM(amount) as paid_amount 
        FROM sale_payments 
        GROUP BY sale_id
      ) p ON s.id = p.sale_id
      WHERE s.status != 'cancelled' AND s.payment_status != 'paid'
      GROUP BY c.id, c.name
      HAVING SUM(s.total_amount - COALESCE(p.paid_amount, 0)) > 0
      ORDER BY total_debt DESC
      LIMIT 5
    `);
    return result.rows;
  }

  private async getInactiveCustomers() {
    const result = await this.db.query(`
      SELECT c.name, MAX(s.sale_date) as last_purchase
      FROM customers c
      LEFT JOIN sales s ON c.id = s.customer_id
      GROUP BY c.id, c.name
      HAVING MAX(s.sale_date) < CURRENT_DATE - INTERVAL '60 days' OR MAX(s.sale_date) IS NULL
      ORDER BY last_purchase ASC NULLS FIRST
      LIMIT 5
    `);
    return result.rows;
  }

  private async getTopSuppliers() {
    const result = await this.db.query(`
      SELECT s.name, COUNT(i.id)::int as imports_count, SUM(i.total_cost) as total_invested
      FROM imports i
      JOIN suppliers s ON i.supplier_id = s.id
      GROUP BY s.id, s.name
      ORDER BY total_invested DESC
      LIMIT 5
    `);
    return result.rows;
  }

  private async getAvgLeadTimes() {
    const result = await this.db.query(`
      SELECT s.name, AVG(actual_arrival - import_date)::float as avg_days
      FROM imports i
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE actual_arrival IS NOT NULL AND import_date IS NOT NULL
      GROUP BY s.id, s.name
      ORDER BY avg_days ASC
      LIMIT 5
    `);
    return result.rows;
  }

  private async getCriticalBatches() {
    const result = await this.db.query(`
      SELECT pb.*, p.name as product_name 
      FROM product_batches pb 
      JOIN products p ON pb.product_id = p.id 
      WHERE pb.expiration_date <= CURRENT_DATE + INTERVAL '90 days'
      ORDER BY pb.expiration_date ASC
      LIMIT 10
    `);
    return result.rows;
  }

  private async getLowStockProducts() {
    const result = await this.db.query(`
      SELECT p.name, p.sku, SUM(i.quantity) as total_quantity 
      FROM inventory i 
      JOIN product_batches pb ON i.batch_id = pb.id 
      JOIN products p ON pb.product_id = p.id 
      GROUP BY p.id, p.name, p.sku 
      HAVING SUM(i.quantity) < 50
      LIMIT 10
    `);
    return result.rows;
  }

  private async getUpcomingImports() {
    const result = await this.db.query(`
      SELECT i.id, i.estimated_arrival, i.status, i.country, i.bl_number, s.name as supplier_name
      FROM imports i
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.status IN ('IN_TRANSIT', 'CUSTOMS')
      ORDER BY i.estimated_arrival ASC NULLS LAST
      LIMIT 5
    `);
    return result.rows;
  }

  private async getWeeklyFlow() {
    const result = await this.db.query(`
      WITH dates AS (
        SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date as date
      ),
      daily_sales AS (
        SELECT DATE(sale_date) as d, SUM(total_amount) as total
        FROM sales 
        WHERE status != 'cancelled' AND sale_date >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(sale_date)
      ),
      daily_imports AS (
        SELECT DATE(import_date) as d, SUM(total_cost) as total
        FROM imports
        WHERE import_date >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(import_date)
      )
      SELECT 
        to_char(d.date, 'DD Mon') as day,
        COALESCE(ds.total, 0) as income,
        COALESCE(di.total, 0) as expense
      FROM dates d
      LEFT JOIN daily_sales ds ON d.date = ds.d
      LEFT JOIN daily_imports di ON d.date = di.d
      ORDER BY d.date ASC
    `);
    return result.rows;
  }
}
