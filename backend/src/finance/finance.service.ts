import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class FinanceService {
  constructor(private readonly db: DatabaseService) {}

  async getFinancialSummary(companyId:string,branchId?:string|null) {
    const [revenue, cogs, expenses, debtors, creditors] = await Promise.all([
      this.getTotalRevenue(companyId,branchId),
      this.getCOGS(companyId,branchId),
      this.getTotalExpenses(companyId,branchId),
      this.getTotalAccountsReceivable(companyId,branchId),
      this.getTotalAccountsPayable(companyId,branchId)
    ]);

    const netProfit = revenue - (cogs + expenses);

    return {
      revenue,
      cogs,
      expenses,
      netProfit,
      debtors,
      creditors
    };
  }

  private async getTotalRevenue(companyId:string,branchId?:string|null) {
    const result = await this.db.query('SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE company_id=$1 AND status != \'cancelled\' AND ($2::uuid IS NULL OR branch_id=$2)',[companyId,branchId||null]);
    return parseFloat(result.rows[0].total);
  }

  private async getCOGS(companyId:string,branchId?:string|null) {
    // Simplified COGS: Sum of (quantity * average_cost) from sales_items
    // In a real system, we'd track actual batch costs
    const result = await this.db.query(`
      SELECT COALESCE(SUM(si.quantity * pb.unit_cost), 0) as total_cogs
      FROM sales_items si
      JOIN product_batches pb ON si.batch_id = pb.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.company_id=$1 AND s.status != 'cancelled' AND ($2::uuid IS NULL OR s.branch_id=$2)
    `,[companyId,branchId||null]);
    return parseFloat(result.rows[0].total_cogs);
  }

  private async getTotalExpenses(companyId:string,branchId?:string|null) {
    const result = await this.db.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE company_id=$1 AND ($2::uuid IS NULL OR branch_id=$2)',[companyId,branchId||null]);
    return parseFloat(result.rows[0].total);
  }

  private async getTotalAccountsReceivable(companyId:string,branchId?:string|null) {
    const result = await this.db.query(`
      SELECT COALESCE(SUM(s.total_amount - COALESCE(p.paid, 0)), 0) as total
      FROM sales s
      LEFT JOIN (SELECT sale_id, SUM(amount) as paid FROM sale_payments GROUP BY sale_id) p ON s.id = p.sale_id
      WHERE s.company_id=$1 AND s.payment_status != 'paid' AND s.status != 'cancelled' AND ($2::uuid IS NULL OR s.branch_id=$2)
    `,[companyId,branchId||null]);
    return parseFloat(result.rows[0].total);
  }

  private async getTotalAccountsPayable(companyId:string,branchId?:string|null) {
    // Imports with pending payment (this is a simplified logic for now)
    if(branchId)return 0;
    const result = await this.db.query(`
      SELECT COALESCE(SUM(i.total_cost), 0) as total FROM imports i JOIN suppliers s ON s.id=i.supplier_id WHERE s.company_id=$1 AND i.status != 'COMPLETED'
    `,[companyId]);
    return parseFloat(result.rows[0].total);
  }

  async getExpenses(companyId:string,branchId?:string|null) {
    const result = await this.db.query('SELECT * FROM expenses WHERE company_id=$1 AND ($2::uuid IS NULL OR branch_id=$2) ORDER BY date DESC',[companyId,branchId||null]);
    return result.rows;
  }

  async createExpense(data: { description: string, amount: number, category: string, date: string, user_id?: string, company_id:string,branch_id?:string,cost_center_id?:string,supplier_id?:string }) {
    const branch=data.branch_id?await this.db.query('SELECT id FROM branches WHERE company_id=$1 AND id=$2 AND is_active',[data.company_id,data.branch_id]):await this.db.query("SELECT id FROM branches WHERE company_id=$1 AND code='MATRIZ' LIMIT 1",[data.company_id]);
    if(!branch.rowCount)throw new Error('No existe sucursal matriz para la empresa.');
    const result = await this.db.query(
      `INSERT INTO expenses (company_id, branch_id, description, amount, category, date, user_id, cost_center_id, supplier_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [data.company_id,branch.rows[0].id,data.description, data.amount, data.category, data.date, data.user_id, data.cost_center_id || null, data.supplier_id || null]
    );
    return result.rows[0];
  }

  async listCostCenters(companyId: string) {
    const result = await this.db.query(
      `SELECT 
         cc.*,
         COALESCE(e.total_expenses, 0)::numeric(14,2) AS total_expenses,
         COALESCE(s.total_sales, 0)::numeric(14,2) AS total_sales,
         COALESCE(s.total_gross_margin, 0)::numeric(14,2) AS total_gross_margin
       FROM cost_centers cc
       LEFT JOIN (
         SELECT cost_center_id, SUM(amount) AS total_expenses 
         FROM expenses 
         WHERE company_id = $1 
         GROUP BY cost_center_id
       ) e ON e.cost_center_id = cc.id
       LEFT JOIN (
         SELECT cost_center_id, SUM(total_amount) AS total_sales, SUM(gross_margin) AS total_gross_margin
         FROM sales 
         WHERE company_id = $1 AND status = 'completed'
         GROUP BY cost_center_id
       ) s ON s.cost_center_id = cc.id
       WHERE cc.company_id = $1
       ORDER BY cc.code ASC`,
      [companyId]
    );
    return result.rows;
  }

  async createCostCenter(companyId: string, data: any) {
    const result = await this.db.query(
      `INSERT INTO cost_centers (company_id, code, name, type, description, budget_amount)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (company_id, code) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         description = EXCLUDED.description,
         budget_amount = EXCLUDED.budget_amount,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        companyId,
        String(data.code).trim().toUpperCase(),
        String(data.name).trim(),
        data.type || 'operational',
        data.description || null,
        Number(data.budget_amount || 0)
      ]
    );
    return result.rows[0];
  }

  async recordSupplierPayment(companyId: string, userId: string, data: any) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const supplier = await client.query('SELECT id, name FROM suppliers WHERE id = $1 AND company_id = $2', [data.supplier_id, companyId]);
      if (!supplier.rowCount) throw new Error('Proveedor no encontrado.');

      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto del pago debe ser mayor a cero.');

      const paymentRes = await client.query(
        `INSERT INTO supplier_payments (
           company_id, supplier_id, expense_id, purchase_order_id, import_id,
           cost_center_id, amount, payment_method, reference, payment_date, notes, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE), $11, $12)
         RETURNING *`,
        [
          companyId,
          data.supplier_id,
          data.expense_id || null,
          data.purchase_order_id || null,
          data.import_id || null,
          data.cost_center_id || null,
          amount,
          data.payment_method || 'transfer',
          data.reference || null,
          data.payment_date || null,
          data.notes || null,
          userId || null
        ]
      );

      // Si aplica a orden de compra
      if (data.purchase_order_id) {
        const poRes = await client.query('SELECT total_amount FROM purchase_orders WHERE id = $1 AND company_id = $2', [data.purchase_order_id, companyId]);
        const paidRes = await client.query('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM supplier_payments WHERE purchase_order_id = $1', [data.purchase_order_id]);
        const poTotal = Number(poRes.rows[0]?.total_amount || 0);
        const poPaid = Number(paidRes.rows[0]?.total_paid || 0);
        const poStatus = poPaid >= poTotal ? 'paid' : poPaid > 0 ? 'partial' : 'pending';
        await client.query('UPDATE purchase_orders SET payment_status = $1 WHERE id = $2', [poStatus, data.purchase_order_id]);
      }

      // Si aplica a importación
      if (data.import_id) {
        const impRes = await client.query('SELECT total_cost FROM imports WHERE id = $1 AND company_id = $2', [data.import_id, companyId]);
        const impPaidRes = await client.query('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM supplier_payments WHERE import_id = $1', [data.import_id]);
        const impTotal = Number(impRes.rows[0]?.total_cost || 0);
        const impPaid = Number(impPaidRes.rows[0]?.total_paid || 0);
        const impStatus = impPaid >= impTotal ? 'paid' : impPaid > 0 ? 'partial' : 'pending';
        await client.query('UPDATE imports SET payment_status = $1 WHERE id = $2', [impStatus, data.import_id]);
      }

      // Si aplica a gasto
      if (data.expense_id) {
        const expRes = await client.query('SELECT amount FROM expenses WHERE id = $1 AND company_id = $2', [data.expense_id, companyId]);
        const expPaidRes = await client.query('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM supplier_payments WHERE expense_id = $1', [data.expense_id]);
        const expTotal = Number(expRes.rows[0]?.amount || 0);
        const expPaid = Number(expPaidRes.rows[0]?.total_paid || 0);
        const expStatus = expPaid >= expTotal ? 'paid' : expPaid > 0 ? 'partial' : 'pending';
        await client.query('UPDATE expenses SET payment_status = $1, paid_amount = $2 WHERE id = $3', [expStatus, expPaid, data.expense_id]);
      }

      await client.query('COMMIT');
      return paymentRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listSupplierPayments(companyId: string, supplierId?: string) {
    const params: any[] = [companyId];
    let query = `
      SELECT 
        sp.*,
        s.name AS supplier_name,
        cc.code AS cost_center_code,
        cc.name AS cost_center_name,
        po.order_number AS purchase_order_number,
        COALESCE(imp.bl_number, imp.tracking_number) AS import_tracking
      FROM supplier_payments sp
      JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN cost_centers cc ON cc.id = sp.cost_center_id
      LEFT JOIN purchase_orders po ON po.id = sp.purchase_order_id
      LEFT JOIN imports imp ON imp.id = sp.import_id
      WHERE sp.company_id = $1
    `;
    if (supplierId) {
      params.push(supplierId);
      query += ` AND sp.supplier_id = $${params.length}`;
    }
    query += ` ORDER BY sp.payment_date DESC, sp.created_at DESC LIMIT 100`;
    const result = await this.db.query(query, params);
    return result.rows;
  }
}
