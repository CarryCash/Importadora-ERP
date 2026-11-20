require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function createFirstAdmin() {
  const { BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME } = process.env;
  if (!BOOTSTRAP_ADMIN_USERNAME || !BOOTSTRAP_ADMIN_PASSWORD || BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
    throw new Error('Define BOOTSTRAP_ADMIN_USERNAME y una BOOTSTRAP_ADMIN_PASSWORD de al menos 12 caracteres.');
  }

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
    await client.query("SELECT pg_advisory_xact_lock(hashtext('importadora-first-admin'))");
    const users = await client.query('SELECT COUNT(*)::int AS count FROM users');
    if (users.rows[0].count !== 0) throw new Error('Ya existe al menos un usuario. El alta inicial está cerrada.');

    const hash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
    await client.query(
      `INSERT INTO users (username, password_hash, email, full_name, role)
       VALUES ($1, $2, $3, $4, 'admin')`,
      [BOOTSTRAP_ADMIN_USERNAME, hash, BOOTSTRAP_ADMIN_EMAIL || null, BOOTSTRAP_ADMIN_NAME || BOOTSTRAP_ADMIN_USERNAME],
    );
    await client.query('COMMIT');
    console.log('Administrador inicial creado. Elimina estas variables del entorno cuando termines.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

createFirstAdmin().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
