import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class FinanceService {
  constructor(private readonly db: DatabaseService) {}

  async getFinancialSummary() {
    const [revenue, cogs, expenses, debtors, creditors] = await Promise.all([
      this.getTotalRevenue(),
      this.getCOGS(),
      this.getTotalExpenses(),
      this.getTotalAccountsReceivable(),
      this.getTotalAccountsPayable()
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

  private async getTotalRevenue() {
    const result = await this.db.query('SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE status != \'cancelled\'');
    return parseFloat(result.rows[0].total);
  }

  private async getCOGS() {
    // Simplified COGS: Sum of (quantity * average_cost) from sales_items
    // In a real system, we'd track actual batch costs
    const result = await this.db.query(`
      SELECT COALESCE(SUM(si.quantity * pb.unit_cost), 0) as total_cogs
      FROM sales_items si
      JOIN product_batches pb ON si.batch_id = pb.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status != 'cancelled'
    `);
    return parseFloat(result.rows[0].total_cogs);
  }

  private async getTotalExpenses() {
    const result = await this.db.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses');
    return parseFloat(result.rows[0].total);
  }

  private async getTotalAccountsReceivable() {
    const result = await this.db.query(`
      SELECT COALESCE(SUM(s.total_amount - COALESCE(p.paid, 0)), 0) as total
      FROM sales s
      LEFT JOIN (SELECT sale_id, SUM(amount) as paid FROM sale_payments GROUP BY sale_id) p ON s.id = p.sale_id
      WHERE s.payment_status != 'paid' AND s.status != 'cancelled'
    `);
    return parseFloat(result.rows[0].total);
  }

  private async getTotalAccountsPayable() {
    // Imports with pending payment (this is a simplified logic for now)
    const result = await this.db.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total FROM imports WHERE status != 'COMPLETED'
    `);
    return parseFloat(result.rows[0].total);
  }

  async getExpenses() {
    const result = await this.db.query('SELECT * FROM expenses ORDER BY date DESC');
    return result.rows;
  }

  async createExpense(data: { description: string, amount: number, category: string, date: string, user_id?: string }) {
    const result = await this.db.query(
      'INSERT INTO expenses (description, amount, category, date, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [data.description, data.amount, data.category, data.date, data.user_id]
    );
    return result.rows[0];
  }
}
