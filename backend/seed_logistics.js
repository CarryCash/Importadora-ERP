const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'importadora',
});

async function seedLogistics() {
  try {
    await client.connect();
    console.log('Conectado para el seed');

    // Add a supplier first if needed
    const supRes = await client.query(`
      INSERT INTO suppliers (name, country, contact_person, email, phone) 
      VALUES ('Global Tech Supplies', 'China', 'Chen Yang', 'chen@globaltech.cn', '+86-555-0199')
      ON CONFLICT DO NOTHING RETURNING id;
    `);

    let supplierId;
    if (supRes.rows.length > 0) {
        supplierId = supRes.rows[0].id;
    } else {
        const existing = await client.query("SELECT id FROM suppliers WHERE name = 'Global Tech Supplies' LIMIT 1");
        supplierId = existing.rows[0].id;
    }

    // Add sample shipments
    const shipments = [
      { 
        supplier_id: supplierId, 
        date: '2026-03-25', 
        country: 'China', 
        ship_cost: 1500, 
        tax_cost: 800, 
        total: 12500, 
        status: 'IN_TRANSIT', 
        bl: 'BL-HK-88229', 
        track: 'ZIMU-400911', 
        eta: '2026-04-20' 
      },
      { 
        supplier_id: supplierId, 
        date: '2026-03-10', 
        country: 'USA', 
        ship_cost: 500, 
        tax_cost: 200, 
        total: 4500, 
        status: 'WAREHOUSE', 
        bl: 'BL-MIA-0012', 
        track: 'DHL-992182', 
        eta: '2026-03-28' 
      },
      { 
        supplier_id: supplierId, 
        date: '2026-04-01', 
        country: 'Germany', 
        ship_cost: 2200, 
        tax_cost: 1100, 
        total: 28000, 
        status: 'CUSTOMS', 
        bl: 'BL-HAM-771', 
        track: 'MSCU-22819', 
        eta: '2026-04-10' 
      }
    ];

    for (const s of shipments) {
        await client.query(`
          INSERT INTO imports (supplier_id, import_date, country, shipping_cost, tax_cost, total_cost, status, bl_number, tracking_number, estimated_arrival)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [s.supplier_id, s.date, s.country, s.ship_cost, s.tax_cost, s.total, s.status, s.bl, s.track, s.eta]);
    }

    console.log('Seed de logística completado con 3 embarques modelo.');
  } catch (err) {
    console.error('Error en el seed:', err);
  } finally {
    await client.end();
  }
}

seedLogistics();
