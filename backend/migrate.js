const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password', // Assumes they kept the default temporarily
  database: 'importadora',
});

async function runMigrations() {
  try {
    await client.connect();
    console.log('Conectado exitosamente');

    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    const files = [
      '../data/tables/users.sql',
      '../data/tables/products.sql',
      '../data/tables/product_batches.sql',
      '../data/tables/customer.sql',
      '../data/tables/suppliers.sql',
      '../data/tables/inventory.sql',
      '../data/tables/sales.sql',
      '../data/tables/imports.sql',
    ];

    for (const file of files) {
      const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
      await client.query(sql);
      console.log(`Ejecutado correctamente: ${file}`);
    }

    console.log('¡Todas las tablas han sido creadas exitosamente!');
  } catch (err) {
    console.error('Error corriendo migraciones:', err);
  } finally {
    await client.end();
  }
}

runMigrations();
