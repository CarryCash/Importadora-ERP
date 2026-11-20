require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'importadora',
    password: process.env.DATABASE_PASSWORD,
    port: 5432,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    const filesToRun = [
      'sales.sql',
      'invoices.sql',
      'returns.sql',
      'quotes_and_orders.sql',
      'stock_movements.sql'
    ];

    for (const fileName of filesToRun) {
      const filePath = path.join(__dirname, 'tables', fileName);
      if (fs.existsSync(filePath)) {
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`⏳ Running ${fileName}...`);
        await client.query(sql);
        console.log(`✅ Successfully executed ${fileName}`);
      } else {
        console.warn(`⚠️ File not found: ${filePath}`);
      }
    }

    console.log('🎉 Migration of Sales Phase 2 completed successfully!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
