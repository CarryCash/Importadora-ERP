const { Pool } = require('pg');

async function checkSchema() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'password',
    database: 'importadora',
  });

  try {
    const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sales'");
    console.log('Columns in sales table:');
    res.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));
    
    const res2 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'imports'");
    console.log('\nColumns in imports table:');
    res2.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkSchema();
