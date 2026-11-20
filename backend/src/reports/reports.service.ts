import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  async getCustomerAnalytics(companyId: string) {
    const [summary, debtors, topCustomers, inactiveCustomers] = await Promise.all([
      this.db.query(
        `SELECT COUNT(DISTINCT c.id)::int customer_count,
                COUNT(DISTINCT c.id) FILTER(WHERE c.created_at>=DATE_TRUNC('month',CURRENT_DATE))::int new_this_month,
                COALESCE(SUM(GREATEST(s.total_amount-COALESCE(p.paid,0),0)),0)::numeric(14,2) receivables,
                COUNT(DISTINCT c.id) FILTER(WHERE s.payment_status!='paid' AND s.sale_date<CURRENT_DATE)::int overdue_customers
         FROM customers c
         LEFT JOIN sales s ON s.customer_id=c.id AND s.company_id=c.company_id AND s.status!='cancelled'
         LEFT JOIN (SELECT sale_id,SUM(amount) paid FROM sale_payments GROUP BY sale_id) p ON p.sale_id=s.id
         WHERE c.company_id=$1 AND c.is_active`,
        [companyId],
      ),
      this.db.query(
        `SELECT c.name, SUM(GREATEST(s.total_amount-COALESCE(p.paid,0),0)) total_debt
         FROM customers c
         JOIN sales s ON s.customer_id=c.id AND s.company_id=c.company_id
         LEFT JOIN (SELECT sale_id,SUM(amount) paid FROM sale_payments GROUP BY sale_id) p ON p.sale_id=s.id
         WHERE c.company_id=$1 AND s.status!='cancelled'
         GROUP BY c.id, c.name
         ORDER BY total_debt DESC
         LIMIT 5`,
        [companyId],
      ),
      this.db.query(
        `SELECT c.name, SUM(s.total_amount) total_spent
         FROM customers c
         JOIN sales s ON s.customer_id=c.id AND s.company_id=c.company_id
         WHERE c.company_id=$1 AND s.status!='cancelled'
         GROUP BY c.id, c.name
         ORDER BY total_spent DESC
         LIMIT 5`,
        [companyId],
      ),
      this.db.query(
        `SELECT c.name, MAX(s.sale_date) last_purchase
         FROM customers c
         LEFT JOIN sales s ON s.customer_id=c.id AND s.company_id=c.company_id AND s.status!='cancelled'
         WHERE c.company_id=$1 AND c.is_active
         GROUP BY c.id, c.name
         HAVING MAX(s.sale_date)<CURRENT_DATE-INTERVAL '60 days' OR MAX(s.sale_date) IS NULL
         ORDER BY last_purchase ASC NULLS FIRST
         LIMIT 5`,
        [companyId],
      ),
    ]);
    return {
      summary: summary.rows[0],
      debtors: debtors.rows,
      topCustomers: topCustomers.rows,
      inactiveCustomers: inactiveCustomers.rows,
    };
  }

  // ─── 1. REPORTE DE COMPRAS E IMPORTACIONES ─────────────────────────────────
  async getImportsPurchasesReport(companyId: string) {
    const [summaryRes, importsRes, purchasesRes] = await Promise.all([
      this.db.query(
        `SELECT 
           COALESCE(SUM(i.total_cost), 0)::numeric(15,2) AS total_imports_cif,
           COALESCE((SELECT SUM(actual_amount) FROM logistics_costs WHERE company_id = $1 AND source_type = 'import'), 0)::numeric(15,2) AS total_logistics_costs,
           COALESCE((SELECT SUM(total_amount) FROM purchase_orders WHERE company_id = $1 AND status != 'cancelled'), 0)::numeric(15,2) AS total_local_purchases,
           (COALESCE(SUM(i.total_cost), 0) + COALESCE((SELECT SUM(total_amount) FROM purchase_orders WHERE company_id = $1 AND status != 'cancelled'), 0))::numeric(15,2) AS total_purchased
         FROM imports i
         JOIN suppliers s ON s.id = i.supplier_id
         WHERE s.company_id = $1`,
        [companyId],
      ),
      this.db.query(
        `SELECT 
           i.id, i.bl_number, i.country, i.status, i.import_date, i.actual_arrival,
           s.name AS supplier_name,
           i.total_cost AS total_cost_cif,
           COALESCE((
             SELECT SUM(allocated_amount) 
             FROM logistics_cost_allocations lca 
             JOIN import_items ii ON ii.id = lca.import_item_id 
             WHERE ii.import_id = i.id
           ), 0)::numeric(14,2) AS allocated_logistics_cost,
           COALESCE(cc.name, 'Comercio Exterior') AS cost_center_name,
           COUNT(DISTINCT ii.id)::int AS items_count,
           COALESCE(SUM(ii.expected_quantity), 0)::numeric AS total_quantity
         FROM imports i
         JOIN suppliers s ON s.id = i.supplier_id
         LEFT JOIN import_items ii ON ii.import_id = i.id
         LEFT JOIN cost_centers cc ON cc.id = i.cost_center_id
         WHERE s.company_id = $1
         GROUP BY i.id, s.name, cc.name
         ORDER BY i.import_date DESC
         LIMIT 50`,
        [companyId],
      ),
      this.db.query(
        `SELECT 
           po.id, po.order_number, po.status, po.expected_date, po.created_at,
           s.name AS supplier_name,
           po.total_amount,
           po.payment_status,
           COALESCE(cc.name, 'Compras Locales') AS cost_center_name,
           COUNT(poi.id)::int AS items_count,
           COALESCE(SUM(poi.ordered_quantity), 0)::numeric AS total_ordered,
           COALESCE(SUM(poi.received_quantity), 0)::numeric AS total_received
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
         LEFT JOIN cost_centers cc ON cc.id = po.cost_center_id
         WHERE po.company_id = $1
         GROUP BY po.id, s.name, cc.name
         ORDER BY po.created_at DESC
         LIMIT 50`,
        [companyId],
      ),
    ]);

    return {
      summary: summaryRes.rows[0],
      imports: importsRes.rows,
      purchase_orders: purchasesRes.rows,
    };
  }

  // ─── 2. REPORTE DE INVENTARIO Y VALORACIÓN FIFO ─────────────────────────────
  async getInventoryFifoValuationReport(companyId: string) {
    const [summaryRes, warehouseRes, productsRes] = await Promise.all([
      this.db.query(
        `SELECT 
           COALESCE(SUM(cl.remaining_quantity * cl.functional_unit_cost), 0)::numeric(15,2) AS total_valuation,
           COALESCE(SUM(b.physical_stock), 0)::numeric AS total_physical_units,
           COALESCE(SUM(b.available_stock), 0)::numeric AS total_available_units,
           COALESCE(SUM(b.reserved_stock), 0)::numeric AS total_reserved_units,
           COALESCE(SUM(b.blocked_stock), 0)::numeric AS total_blocked_units,
           COUNT(cl.id) FILTER (WHERE cl.status = 'active')::int AS total_active_layers
         FROM products p
         LEFT JOIN inventory_balances b ON b.product_id = p.id
         LEFT JOIN inventory_cost_layers cl ON cl.product_id = p.id AND cl.status = 'active'
         WHERE p.company_id = $1`,
        [companyId],
      ),
      this.db.query(
        `SELECT 
           w.id AS warehouse_id, w.name AS warehouse_name, w.operating_type,
           COALESCE(SUM(b.physical_stock), 0)::numeric AS physical_units,
           COALESCE(SUM(b.available_stock), 0)::numeric AS available_units,
           COALESCE(SUM(cl.remaining_quantity * cl.functional_unit_cost), 0)::numeric(15,2) AS warehouse_valuation
         FROM warehouses w
         LEFT JOIN inventory_balances b ON b.warehouse_id = w.id
         LEFT JOIN inventory_cost_layers cl ON cl.warehouse_id = w.id AND cl.status = 'active'
         WHERE w.company_id = $1 AND w.is_active = true
         GROUP BY w.id, w.name, w.operating_type
         ORDER BY warehouse_valuation DESC`,
        [companyId],
      ),
      this.db.query(
        `SELECT 
           p.id AS product_id, p.name AS product_name, p.sku,
           COALESCE(SUM(b.physical_stock), 0)::numeric AS physical_stock,
           COALESCE(SUM(b.available_stock), 0)::numeric AS available_stock,
           COALESCE(SUM(cl.remaining_quantity * cl.functional_unit_cost), 0)::numeric(15,2) AS total_valuation,
           CASE 
             WHEN SUM(cl.remaining_quantity) > 0 
             THEN (SUM(cl.remaining_quantity * cl.functional_unit_cost) / SUM(cl.remaining_quantity))::numeric(15,4)
             ELSE 0 
           END AS average_fifo_unit_cost,
           COUNT(cl.id) FILTER (WHERE cl.status = 'active')::int AS active_layers_count
         FROM products p
         LEFT JOIN inventory_balances b ON b.product_id = p.id
         LEFT JOIN inventory_cost_layers cl ON cl.product_id = p.id AND cl.status = 'active'
         WHERE p.company_id = $1
         GROUP BY p.id, p.name, p.sku
         HAVING COALESCE(SUM(b.physical_stock), 0) > 0 OR COALESCE(SUM(cl.remaining_quantity), 0) > 0
         ORDER BY total_valuation DESC`,
        [companyId],
      ),
    ]);

    return {
      summary: summaryRes.rows[0],
      warehouses: warehouseRes.rows,
      products: productsRes.rows,
    };
  }

  // ─── 3. REPORTE DE VENTAS Y MARGEN BRUTO FIFO ──────────────────────────────
  async getSalesGrossMarginReport(companyId: string) {
    const [summaryRes, salesRes] = await Promise.all([
      this.db.query(
        `WITH sale_costs AS (
           SELECT 
             s.id AS sale_id,
             s.subtotal,
             COALESCE(s.cogs_total, 
               (SELECT SUM(icc.quantity_consumed * icc.unit_cost_applied)
                FROM inventory_movements im
                JOIN inventory_movement_lines iml ON iml.movement_id = im.id
                JOIN inventory_cost_consumptions icc ON icc.movement_line_id = iml.id
                WHERE im.reference_doc_id = s.id AND im.reference_doc_type = 'sale'
               ), 0
             ) AS cogs
           FROM sales s
           WHERE s.company_id = $1 AND s.status != 'cancelled'
         )
         SELECT 
           COALESCE(SUM(subtotal), 0)::numeric(15,2) AS total_revenue,
           COALESCE(SUM(cogs), 0)::numeric(15,2) AS total_cogs,
           (COALESCE(SUM(subtotal), 0) - COALESCE(SUM(cogs), 0))::numeric(15,2) AS gross_profit,
           CASE 
             WHEN SUM(subtotal) > 0 
             THEN (((SUM(subtotal) - SUM(cogs)) / SUM(subtotal)) * 100)::numeric(8,2)
             ELSE 0 
           END AS gross_margin_percent
         FROM sale_costs`,
        [companyId],
      ),
      this.db.query(
        `SELECT 
           s.id AS sale_id, s.sale_number, s.sale_date, s.status, s.payment_status,
           c.name AS customer_name,
           s.subtotal, s.discount, s.total_amount,
           COALESCE(s.cogs_total, 
             (SELECT SUM(icc.quantity_consumed * icc.unit_cost_applied)
              FROM inventory_movements im
              JOIN inventory_movement_lines iml ON iml.movement_id = im.id
              JOIN inventory_cost_consumptions icc ON icc.movement_line_id = iml.id
              WHERE im.reference_doc_id = s.id AND im.reference_doc_type = 'sale'
             ), 0
           )::numeric(15,2) AS cogs,
           (s.subtotal - COALESCE(s.cogs_total, 
             (SELECT SUM(icc.quantity_consumed * icc.unit_cost_applied)
              FROM inventory_movements im
              JOIN inventory_movement_lines iml ON iml.movement_id = im.id
              JOIN inventory_cost_consumptions icc ON icc.movement_line_id = iml.id
              WHERE im.reference_doc_id = s.id AND im.reference_doc_type = 'sale'
             ), 0
           ))::numeric(15,2) AS gross_margin,
           CASE 
             WHEN s.subtotal > 0 
             THEN (((s.subtotal - COALESCE(s.cogs_total, 0)) / s.subtotal) * 100)::numeric(8,2)
             ELSE 0 
           END AS margin_percent,
           COALESCE(cc.name, 'Comercial') AS cost_center_name
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN cost_centers cc ON cc.id = s.cost_center_id
         WHERE s.company_id = $1 AND s.status != 'cancelled'
         ORDER BY s.sale_date DESC
         LIMIT 100`,
        [companyId],
      ),
    ]);

    return {
      summary: summaryRes.rows[0],
      sales: salesRes.rows,
    };
  }

  // ─── 4. REPORTE DE CARTERA (AR) Y CUENTAS POR PAGAR (AP) ───────────────────
  async getReceivablesPayablesAgingReport(companyId: string) {
    const [receivablesRes, payablesRes] = await Promise.all([
      this.db.query(
        `SELECT 
           c.id AS customer_id, c.name AS customer_name, c.credit_limit, c.payment_terms,
           COALESCE(SUM(GREATEST(s.total_amount - COALESCE(p.paid, 0), 0)), 0)::numeric(14,2) AS total_debt,
           COALESCE(SUM(GREATEST(s.total_amount - COALESCE(p.paid, 0), 0)) FILTER (WHERE s.sale_date + (c.payment_terms || ' days')::interval >= CURRENT_DATE), 0)::numeric(14,2) AS current_balance,
           COALESCE(SUM(GREATEST(s.total_amount - COALESCE(p.paid, 0), 0)) FILTER (WHERE s.sale_date + (c.payment_terms || ' days')::interval < CURRENT_DATE AND s.sale_date + (c.payment_terms || ' days')::interval >= CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS overdue_1_30,
           COALESCE(SUM(GREATEST(s.total_amount - COALESCE(p.paid, 0), 0)) FILTER (WHERE s.sale_date + (c.payment_terms || ' days')::interval < CURRENT_DATE - INTERVAL '30 days' AND s.sale_date + (c.payment_terms || ' days')::interval >= CURRENT_DATE - INTERVAL '60 days'), 0)::numeric(14,2) AS overdue_31_60,
           COALESCE(SUM(GREATEST(s.total_amount - COALESCE(p.paid, 0), 0)) FILTER (WHERE s.sale_date + (c.payment_terms || ' days')::interval < CURRENT_DATE - INTERVAL '60 days'), 0)::numeric(14,2) AS overdue_60_plus
         FROM customers c
         JOIN sales s ON s.customer_id = c.id AND s.company_id = c.company_id
         LEFT JOIN (SELECT sale_id, SUM(amount) AS paid FROM sale_payments GROUP BY sale_id) p ON p.sale_id = s.id
         WHERE c.company_id = $1 AND s.status != 'cancelled' AND s.payment_status != 'paid'
         GROUP BY c.id, c.name, c.credit_limit, c.payment_terms
         HAVING SUM(GREATEST(s.total_amount - COALESCE(p.paid, 0), 0)) > 0
         ORDER BY total_debt DESC`,
        [companyId],
      ),
      this.db.query(
        `SELECT 
           s.id AS supplier_id, s.name AS supplier_name,
           COALESCE(SUM(GREATEST(e.amount - e.paid_amount, 0)), 0)::numeric(14,2) AS total_payable,
           COALESCE(SUM(GREATEST(e.amount - e.paid_amount, 0)) FILTER (WHERE e.date >= CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS payable_0_30,
           COALESCE(SUM(GREATEST(e.amount - e.paid_amount, 0)) FILTER (WHERE e.date < CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS payable_30_plus
         FROM suppliers s
         JOIN expenses e ON e.supplier_id = s.id AND e.company_id = s.company_id
         WHERE s.company_id = $1 AND e.payment_status != 'paid'
         GROUP BY s.id, s.name
         HAVING SUM(GREATEST(e.amount - e.paid_amount, 0)) > 0
         ORDER BY total_payable DESC`,
        [companyId],
      ),
    ]);

    return {
      receivables: receivablesRes.rows,
      payables: payablesRes.rows,
    };
  }

  // ─── 5. REPORTE OPERATIVO POR CENTROS DE COSTO ─────────────────────────────
  async getCostCentersOperationalReport(companyId: string) {
    const res = await this.db.query(
      `SELECT 
         cc.id, cc.code, cc.name, cc.type, cc.budget_amount,
         COALESCE((SELECT SUM(amount) FROM expenses WHERE cost_center_id = cc.id AND company_id = cc.company_id), 0)::numeric(14,2) AS operating_expenses,
         COALESCE((SELECT SUM(actual_amount) FROM logistics_costs WHERE cost_center_id = cc.id AND company_id = cc.company_id), 0)::numeric(14,2) AS logistics_costs,
         COALESCE((SELECT SUM(total_amount) FROM purchase_orders WHERE cost_center_id = cc.id AND company_id = cc.company_id AND status != 'cancelled'), 0)::numeric(14,2) AS purchase_orders_amount,
         COALESCE((SELECT SUM(total_cost) FROM imports WHERE cost_center_id = cc.id AND company_id = cc.company_id), 0)::numeric(14,2) AS imports_amount,
         COALESCE((SELECT SUM(subtotal) FROM sales WHERE cost_center_id = cc.id AND company_id = cc.company_id AND status != 'cancelled'), 0)::numeric(14,2) AS sales_revenue
       FROM cost_centers cc
       WHERE cc.company_id = $1 AND cc.is_active = true
       ORDER BY cc.code ASC`,
      [companyId],
    );

    return res.rows;
  }

  // ─── DASHBOARD GENERAL EXISTENTE ──────────────────────────────────────────
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
      weeklyFlow,
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
      this.getWeeklyFlow(),
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
      weeklyFlow: weeklyFlow,
    };
  }

  private async getTotalRevenue() {
    const result = await this.db.query("SELECT COALESCE(SUM(total_amount), 0) as total_revenue FROM sales WHERE status != 'cancelled'");
    return parseFloat(result.rows[0].total_revenue);
  }

  private async getSalesToday() {
    const result = await this.db.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE sale_date = CURRENT_DATE AND status != 'cancelled'");
    return parseFloat(result.rows[0].total);
  }

  private async getPendingOrders() {
    const result = await this.db.query("SELECT COUNT(*)::int as count FROM sales WHERE status = 'completed' AND sale_date >= CURRENT_DATE - INTERVAL '2 days'");
    return result.rows[0].count;
  }

  private async getInTransitImports() {
    const result = await this.db.query("SELECT COUNT(*)::int as count FROM imports WHERE status IN ('IN_TRANSIT', 'CUSTOMS')");
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
