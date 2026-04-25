const { Client } = require('pg');

async function run() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'importadora',
    password: 'password',
    port: 5432,
  });

  try {
    await client.connect();

    const result = await client.query(`
      INSERT INTO import_containers (import_id, container_number, container_type, port_name, customs_status, free_days_deadline) 
      SELECT 
        id, 
        tracking_number, 
        '40HQ', 
        'Contecon Guayaquil', 
        CASE 
          WHEN status = 'CUSTOMS' THEN 'Aforo Físico' 
          WHEN status = 'IN_TRANSIT' THEN 'En Tránsito' 
          ELSE 'Llegado' 
        END, 
        CURRENT_DATE + CAST((floor(random() * 5) - 1) || ' days' AS INTERVAL)
      FROM imports 
      WHERE tracking_number IS NOT NULL AND status IN ('CUSTOMS', 'IN_TRANSIT')
      RETURNING *;
    `);

    console.log('Real containers inserted:', result.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
