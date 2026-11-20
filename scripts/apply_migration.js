const fs = require('fs');
const path = require('path');
const { Client } = require('../backend/node_modules/pg');

async function main() {
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'Lords1235',
    database: 'importadora',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL.');

    const migrationPath = path.join(__dirname, '../data/migrations/20261122_enterprise_closing_and_cost_centers.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying migration 20261122_enterprise_closing_and_cost_centers.sql...');
    await client.query(sql);
    console.log('Migration applied successfully!');

    // Check cost centers
    const cc = await client.query('SELECT count(*) FROM cost_centers');
    console.log(`Cost centers count: ${cc.rows[0].count}`);

    // Check supplier_payments table
    const sp = await client.query('SELECT count(*) FROM supplier_payments');
    console.log(`Supplier payments count: ${sp.rows[0].count}`);

    await client.end();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
