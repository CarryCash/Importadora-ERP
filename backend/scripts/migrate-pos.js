require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function migratePos() {
  if (!process.env.DATABASE_PASSWORD) throw new Error('Define DATABASE_PASSWORD en backend/.env.');
  const migrationPath = path.resolve(__dirname, '../../data/migrations/20261025_pos_ecuador.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME || 'importadora',
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migración del POS aplicada correctamente.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

migratePos().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
