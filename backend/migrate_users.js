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
    console.log('Starting Users Management migration...');
    await client.query('BEGIN');

    // 1. Add new columns to users table
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS assigned_warehouse_id UUID REFERENCES warehouses(id),
      ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
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
