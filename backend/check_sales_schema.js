const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'password', database: 'importadora' });
async function check() {
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('Tables:', tables.rows.map(r => r.table_name));
  
  for (const table of tables.rows) {
    const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table.table_name}'`);
    console.log(`Columns for ${table.table_name}:`, cols.rows.map(c => `${c.column_name} (${c.data_type})`));
  }
  await pool.end();
}
check();
