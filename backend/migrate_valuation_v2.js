const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'importadora',
  password: 'password',
  port: 5432,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting Inventory Valuation migration (Fixed)...');
    await client.query('BEGIN');

    // 1. Add unit_cost column
    await client.query(`
      ALTER TABLE product_batches 
      ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,4) DEFAULT 0;
    `);

    // 2. Backfill existing batches
    // Renaming alias 'is' to 'stats' to avoid reserved keyword issues
    await client.query(`
      WITH import_stats AS (
        SELECT 
          import_id, 
          SUM(quantity) as total_units
        FROM inventory i
        JOIN product_batches pb ON i.batch_id = pb.id
        WHERE pb.import_id IS NOT NULL
        GROUP BY import_id
      )
      UPDATE product_batches pb
      SET unit_cost = (i.total_cost / NULLIF(stats.total_units, 0))
      FROM imports i
      JOIN import_stats stats ON i.id = stats.import_id
      WHERE pb.import_id = i.id AND pb.unit_cost = 0;
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
