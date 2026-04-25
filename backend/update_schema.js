const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'importadora',
});

async function runAlter() {
  try {
    await client.connect();
    console.log('Conectado a la base de datos');

    const queries = [
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS bl_number VARCHAR(100);",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS estimated_arrival DATE;",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS actual_arrival DATE;",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS fob_value NUMERIC DEFAULT 0;",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS freight_cost NUMERIC DEFAULT 0;",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS insurance_cost NUMERIC DEFAULT 0;",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS customs_taxes NUMERIC DEFAULT 0;",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS arcsa_taxes NUMERIC DEFAULT 0;",
      "ALTER TABLE imports ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1;"
    ];

    for (const q of queries) {
      await client.query(q);
      console.log(`Ejecutado: ${q}`);
    }

    console.log('Base de datos actualizada correctamente con campos de logística.');
  } catch (err) {
    console.error('Error actualizando base de datos:', err);
  } finally {
    await client.end();
  }
}

runAlter();
