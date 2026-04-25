const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'importadora',
});

async function main() {
  await client.connect();
  console.log('Connected to DB');

  // Fetch a valid supplier_id and product_id to simulate real data
  const suppliers = await client.query(`SELECT id FROM suppliers LIMIT 1`);
  const products = await client.query(`SELECT id FROM products LIMIT 1`);
  
  if (suppliers.rows.length === 0) { console.error('No suppliers!'); return; }
  if (products.rows.length === 0) { console.error('No products!'); return; }

  const supplier_id = suppliers.rows[0].id;
  const product_id = products.rows[0].id;

  console.log('Using supplier_id:', supplier_id);
  console.log('Using product_id:', product_id);

  try {
    await client.query('BEGIN');

    // Step 1: Insert into imports
    console.log('\n--- Testing INSERT into imports ---');
    const importRes = await client.query(
      `INSERT INTO imports (
        supplier_id, import_date, country, shipping_cost, tax_cost, total_cost,
        status, bl_number, tracking_number, estimated_arrival, actual_arrival,
        fob_value, freight_cost, insurance_cost, customs_taxes, arcsa_taxes, exchange_rate
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [
        supplier_id, '2026-04-01', 'China', 100, 50, 1500,
        'IN_TRANSIT', 'BL-TEST-001', 'CONT-TEST-001', '2026-04-30', null,
        1000, 200, 100, 150, 50, 1.0
      ]
    );
    console.log('imports INSERT OK. id:', importRes.rows[0].id);
    const newImport = importRes.rows[0];

    // Step 2: Insert into product_batches
    console.log('\n--- Testing INSERT into product_batches ---');
    const batchRes = await client.query(
      `INSERT INTO product_batches (product_id, batch_number, manufacturing_date, expiration_date, import_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [product_id, 'BATCH-DEBUG-001', null, '2028-01-01', newImport.id]
    );
    console.log('product_batches INSERT OK. id:', batchRes.rows[0].id);
    const newBatch = batchRes.rows[0];

    // Step 3: Insert into inventory
    console.log('\n--- Testing INSERT into inventory ---');
    await client.query(
      `INSERT INTO inventory (batch_id, quantity, warehouse_location) VALUES ($1, $2, $3)`,
      [newBatch.id, 100, 'Central']
    );
    console.log('inventory INSERT OK');

    await client.query('ROLLBACK'); // Don't actually save test data
    console.log('\n✅ All steps passed! Test transaction rolled back.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ TRANSACTION FAILED:');
    console.error('  code:', err.code);
    console.error('  message:', err.message);
    console.error('  detail:', err.detail);
    console.error('  hint:', err.hint);
    console.error('  constraint:', err.constraint);
    console.error('  table:', err.table);
    console.error('  column:', err.column);
  }

  await client.end();
}

main().catch(e => console.error('FATAL:', e.message));
