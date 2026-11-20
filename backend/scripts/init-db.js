require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function initializeDatabase() {
  if (!process.env.DATABASE_PASSWORD) throw new Error('Define DATABASE_PASSWORD en backend/.env.');
  const projectRoot = path.resolve(__dirname, '../..');
  const schemaPath = path.join(projectRoot, 'data/schema.sql');
  const migrationsDir = path.join(projectRoot, 'data/migrations');
  let schema = fs.readFileSync(schemaPath, 'utf8');
  schema = schema.replace(/^\\i\s+(.+?)\s*$/gm, (_match, relativePath) => {
    const includePath = path.resolve(projectRoot, relativePath.trim());
    return fs.readFileSync(includePath, 'utf8');
  });
  const migrations = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({ name: file, sql: fs.readFileSync(path.join(migrationsDir, file), 'utf8') }));

  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME || 'importadora',
  });

  await client.connect();
  try {
    const initialized = await client.query("SELECT to_regclass('public.users') AS users_table");
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    if (!initialized.rows[0].users_table) {
      await client.query(schema);
      console.log('Esquema inicial creado.');
    } else {
      console.log('El esquema base ya existe; se revisarán las migraciones pendientes.');
    }

    for (const migration of migrations) {
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
        [migration.name],
      );
      if (alreadyApplied.rowCount) continue;
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [migration.name]);
      console.log(`Migración aplicada: ${migration.name}`);
    }

    await client.query('COMMIT');
    console.log('Base de datos lista.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

initializeDatabase().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
