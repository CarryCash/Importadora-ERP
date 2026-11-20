const { Client } = require('../backend/node_modules/pg');

async function main() {
  const c = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'Lords1235',
    database: 'importadora',
  });
  await c.connect();

  const tables = ['customers', 'cost_centers', 'supplier_payments', 'expenses', 'inventory_cost_layers', 'inventory_balances', 'inventory_movements', 'inventory_movement_lines'];
  for (const t of tables) {
    const cols = await c.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [t]);
    console.log(`=== TABLE: ${t} ===`);
    console.log(cols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  }

  // Also show existing companies
  const comp = await c.query("SELECT * FROM companies LIMIT 5");
  console.log('=== EXISTING COMPANIES ===', comp.rows);

  await c.end();
}

main().catch(console.error);
