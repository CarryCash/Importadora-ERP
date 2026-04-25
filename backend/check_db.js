const { Client } = require('pg');
const client = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'password', database: 'importadora' });

async function main() {
  await client.connect();

  // 1. Check columns
  const cols = await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'imports' ORDER BY ordinal_position`);
  console.log('=== IMPORTS COLUMNS ===');
  cols.rows.forEach(r => console.log(' -', r.column_name, '|', r.data_type, '| nullable:', r.is_nullable));

  const pbCols = await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'product_batches' ORDER BY ordinal_position`);
  console.log('\n=== PRODUCT_BATCHES COLUMNS ===');
  pbCols.rows.forEach(r => console.log(' -', r.column_name, '|', r.data_type, '| nullable:', r.is_nullable));

  // 2. Check if there are any suppliers to use
  const suppliers = await client.query(`SELECT id, name FROM suppliers LIMIT 3`);
  console.log('\n=== SUPPLIERS (first 3) ===');
  suppliers.rows.forEach(r => console.log(' -', r.id, '|', r.name));

  // 3. Check if there are any products to use
  const products = await client.query(`SELECT id, name FROM products LIMIT 3`);
  console.log('\n=== PRODUCTS (first 3) ===');
  products.rows.forEach(r => console.log(' -', r.id, '|', r.name));

  await client.end();
}

main().catch(e => console.error('ERROR:', e.message));
