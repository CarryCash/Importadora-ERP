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

    await client.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
        delivery_number VARCHAR(50) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'Preparando',
        driver_name VARCHAR(100),
        vehicle_plate VARCHAR(20),
        scheduled_time TIMESTAMP,
        delivery_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('deliveries table created or already exists.');

    // Insert mock deliveries for existing sales to have some data
    const sales = await client.query('SELECT id, sale_number FROM sales LIMIT 3');
    if (sales.rows.length > 0) {
      for (let i = 0; i < sales.rows.length; i++) {
        const sale = sales.rows[i];
        const dNum = `DESP-2026-${String(i+1).padStart(3, '0')}`;
        const status = i === 0 ? 'En Ruta' : (i === 1 ? 'Preparando' : 'En Cola');
        
        await client.query(`
          INSERT INTO deliveries (sale_id, delivery_number, status, driver_name, vehicle_plate, scheduled_time, delivery_address)
          VALUES ($1, $2, $3, 'Juan Perez', 'GCA-1234', CURRENT_TIMESTAMP + (random() * 2 || ' days')::interval, 'Guayaquil Centro')
          ON CONFLICT (delivery_number) DO NOTHING;
        `, [sale.id, dNum, status]);
      }
      console.log('Inserted sample deliveries.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
