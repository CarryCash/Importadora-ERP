const { Client } = require('pg');

async function run() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'importadora',
    password: 'password', // Or just empty if no password
    port: 5432,
  });

  try {
    await client.connect();
    
    // Create import_containers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS import_containers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
        container_number VARCHAR(50) NOT NULL,
        container_type VARCHAR(20) NOT NULL,
        port_name VARCHAR(100),
        customs_status VARCHAR(50),
        free_days_deadline DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("import_containers table created or already exists.");

    // See if there are imports to attach some dummy containers
    const imports = await client.query('SELECT id FROM imports LIMIT 2');
    if (imports.rows.length > 0) {
      const imp1 = imports.rows[0].id;
      // create 2 containers for imp1, one with critical free_days, one normal
      // Check if containers exist first
      const existing = await client.query('SELECT count(*) FROM import_containers WHERE import_id = $1', [imp1]);
      if (parseInt(existing.rows[0].count) === 0) {
        await client.query(`
          INSERT INTO import_containers (import_id, container_number, container_type, port_name, customs_status, free_days_deadline)
          VALUES 
          ($1, 'HLXU1234567', '40HQ', 'Contecon Guayaquil', 'Aforo Físico', CURRENT_DATE + INTERVAL '2 days'),
          ($1, 'MSKU9876543', '20DC', 'TPG Guayaquil', 'En Tránsito', CURRENT_DATE + INTERVAL '10 days')
        `, [imp1]);
        console.log("Inserted dummy containers.");
      }
    }

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
