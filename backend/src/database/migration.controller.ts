import { Controller, Post, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Public } from '../auth/public.decorator';

/**
 * MigrationController
 * Expone /api/migrations/run-sales para ejecutar la migración
 * del módulo de ventas directamente desde el backend (sin docker exec).
 *
 * USAGE:
 *   POST http://localhost:3000/api/migrations/run-sales
 */
@Public()
@Controller('api/migrations')
export class MigrationController {
  constructor(private readonly db: DatabaseService) {}

  @Post('run-sales')
  async runSalesMigration() {
    const results: string[] = [];

    const steps: { sql: string; label: string }[] = [
      {
        label: 'Add sale_number to sales',
        sql: `ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_number VARCHAR(20) UNIQUE`,
      },
      {
        label: 'Add status to sales',
        sql: `ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed'`,
      },
      {
        label: 'Add subtotal to sales',
        sql: `ALTER TABLE sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0`,
      },
      {
        label: 'Add discount to sales',
        sql: `ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0`,
      },
      {
        label: 'Add notes to sales',
        sql: `ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes TEXT`,
      },
      {
        label: 'Add user_id to sales',
        sql: `ALTER TABLE sales ADD COLUMN IF NOT EXISTS user_id UUID`,
      },
      {
        label: 'Add discount to sales_items',
        sql: `ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0`,
      },
      {
        label: 'Create sale_payments table',
        sql: `
          CREATE TABLE IF NOT EXISTS sale_payments (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            method TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            reference TEXT,
            payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `,
      },
      {
        label: 'Set default payment_status on existing rows',
        sql: `UPDATE sales SET payment_status = 'pending' WHERE payment_status IS NULL`,
      },
    ];

    for (const step of steps) {
      try {
        await this.db.query(step.sql);
        results.push(`✅ ${step.label}`);
      } catch (err: any) {
        results.push(`❌ ${step.label}: ${err.message}`);
      }
    }

    return {
      message: 'Migración de Sales completada.',
      results,
    };
  }

  @Get('status')
  async checkSalesSchema() {
    const columns = await this.db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sales'
      ORDER BY ordinal_position
    `);
    const paymentTable = await this.db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'sale_payments'
      ) AS exists
    `);
    return {
      sales_columns: columns.rows,
      sale_payments_exists: paymentTable.rows[0].exists,
    };
  }
}
