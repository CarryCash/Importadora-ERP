const { Client } = require('../backend/node_modules/pg');

async function runEnterprisePilot() {
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'Lords1235',
    database: 'importadora',
  });

  await client.connect();
  console.log('================================================================');
  console.log('🚀 INICIANDO PILOTO EMPRESARIAL INTEGRAL - IMPORTADORA ERP');
  console.log('================================================================\n');

  try {
    // ─── 0. EMPRESA, SUCURSAL Y USUARIO ────────────────────────────────────────
    console.log('--- 1. CONFIGURACIÓN CORPORATIVA Y CENTROS DE COSTO ---');
    let compRes = await client.query("SELECT id FROM companies WHERE name = 'Importadora Comercial del Ecuador S.A.S.'");
    let companyId;
    if (!compRes.rowCount) {
      const c = await client.query(
        `INSERT INTO companies (name, legal_name, ruc, email, phone, address, currency)
         VALUES ('Importadora Comercial del Ecuador S.A.S.', 'IMPORTADORA COMERCIAL DEL ECUADOR S.A.S.', '1792345678001', 'gerencia@importadora.ec', '+593-2-2999999', 'Av. 10 de Agosto y Naciones Unidas, Quito', 'USD')
         RETURNING id`
      );
      companyId = c.rows[0].id;
    } else {
      companyId = compRes.rows[0].id;
    }
    console.log(`✓ Empresa activa ID: ${companyId}`);

    // Sucursal Matriz
    let branchRes = await client.query("SELECT id FROM branches WHERE company_id = $1 AND code = 'MATRIZ'", [companyId]);
    let branchId;
    if (!branchRes.rowCount) {
      const b = await client.query(
        `INSERT INTO branches (company_id, code, name, address, city, is_active)
         VALUES ($1, 'MATRIZ', 'Sucursal Matriz Quito', 'Av. Amazonas N40-12', 'Quito', true)
         RETURNING id`,
        [companyId]
      );
      branchId = b.rows[0].id;
    } else {
      branchId = branchRes.rows[0].id;
    }

    // Usuario Administrador
    let userRes = await client.query("SELECT id FROM users WHERE company_id = $1 LIMIT 1", [companyId]);
    let userId;
    if (!userRes.rowCount) {
      const u = await client.query(
        `INSERT INTO users (company_id, branch_id, username, email, password_hash, full_name, role)
         VALUES ($1, $2, 'admin_corp', 'admin@importadora.ec', '$2b$10$dummyhashnotforlogin1234567890', 'Director de Operaciones & Finanzas', 'admin')
         RETURNING id`,
        [companyId, branchId]
      );
      userId = u.rows[0].id;
    } else {
      userId = userRes.rows[0].id;
    }

    // Centros de Costo
    const costCentersDef = [
      { code: 'CC-IMP', name: 'Comercio Exterior & Importaciones', type: 'import', budget: 50000 },
      { code: 'CC-LOG', name: 'Logística, Bodegas & Distribución', type: 'logistics', budget: 30000 },
      { code: 'CC-COM', name: 'Comercial, Ventas & Marketing', type: 'commercial', budget: 40000 },
      { code: 'CC-ADM', name: 'Administración Central & Finanzas', type: 'administrative', budget: 20000 },
    ];
    const costCenterMap = {};
    for (const cc of costCentersDef) {
      const res = await client.query(
        `INSERT INTO cost_centers (company_id, code, name, type, budget_amount)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (company_id, code) DO UPDATE SET budget_amount = EXCLUDED.budget_amount
         RETURNING id`,
        [companyId, cc.code, cc.name, cc.type, cc.budget]
      );
      costCenterMap[cc.code] = res.rows[0].id;
      console.log(`  ✓ Centro de Costo ${cc.code}: ${cc.name} (Presupuesto: $${cc.budget})`);
    }

    // ─── 2. PROVEEDORES Y BODEGAS ──────────────────────────────────────────────
    console.log('\n--- 2. PROVEEDORES, BODEGAS Y UBICACIONES WMS ---');
    const suppliersDef = [
      { name: 'Shenzhen Tech & Hardware Corp.', tax: 'CN-88392019', type: 'foreign' },
      { name: 'Pacific Shipping Lines Ltd.', tax: 'NAV-991823', type: 'shipping' },
      { name: 'Agencia de Aduanas Integradas Ecuador S.A.', tax: '1791234567001', type: 'customs' },
      { name: 'Distribuciones Industriales de la Sierra Cía. Ltda.', tax: '1799876543001', type: 'local' },
    ];
    const supplierMap = {};
    for (const s of suppliersDef) {
      let supRes = await client.query('SELECT id FROM suppliers WHERE company_id = $1 AND name = $2', [companyId, s.name]);
      if (!supRes.rowCount) {
        const ins = await client.query(
          `INSERT INTO suppliers (company_id, name, tax_id, contact_name, email, phone, is_active)
           VALUES ($1, $2, $3, 'Representante Autorizado', 'contacto@proveedor.com', '+593-999999999', true)
           RETURNING id`,
          [companyId, s.name, s.tax]
        );
        supplierMap[s.name] = ins.rows[0].id;
      } else {
        supplierMap[s.name] = supRes.rows[0].id;
      }
      console.log(`  ✓ Proveedor: ${s.name}`);
    }

    // Bodega Principal
    let whRes = await client.query("SELECT id FROM warehouses WHERE company_id = $1 AND code = 'WH-QUITO'", [companyId]);
    let whId;
    if (!whRes.rowCount) {
      const w = await client.query(
        `INSERT INTO warehouses (company_id, branch_id, code, name, address, type, operating_type, is_active)
         VALUES ($1, $2, 'WH-QUITO', 'Bodega Principal Quito Inés Gangotena', 'Inés Gangotena y Av. Eloy Alfaro', 'physical', 'distribution', true)
         RETURNING id`,
        [companyId, branchId]
      );
      whId = w.rows[0].id;
    } else {
      whId = whRes.rows[0].id;
    }

    // Bodega Cuarentena
    let whQuar = await client.query("SELECT id FROM warehouses WHERE company_id = $1 AND code = 'WH-QUARANTINE'", [companyId]);
    if (!whQuar.rowCount) {
      await client.query(
        `INSERT INTO warehouses (company_id, branch_id, code, name, type, is_active)
         VALUES ($1, $2, 'WH-QUARANTINE', 'Bodega de Cuarentena e Inspección', 'physical', true)`,
        [companyId, branchId]
      );
    }

    // Ubicaciones WMS (Almacenamiento y Despacho)
    let locStorageRes = await client.query("SELECT id FROM storage_locations WHERE warehouse_id = $1 AND code = 'A-01-01'", [whId]);
    let locStorageId;
    if (!locStorageRes.rowCount) {
      const loc = await client.query(
        `INSERT INTO storage_locations (company_id, warehouse_id, code, name, zone, aisle, location_type, status, capacity_units)
         VALUES ($1, $2, 'A-01-01', 'Rack Pallets Nivel 1', 'A', '01', 'storage', 'active', 5000)
         RETURNING id`,
        [companyId, whId]
      );
      locStorageId = loc.rows[0].id;
    } else {
      locStorageId = locStorageRes.rows[0].id;
    }

    let locDispatchRes = await client.query("SELECT id FROM storage_locations WHERE warehouse_id = $1 AND code = 'DESPACHO'", [whId]);
    let locDispatchId;
    if (!locDispatchRes.rowCount) {
      const loc = await client.query(
        `INSERT INTO storage_locations (company_id, warehouse_id, code, name, zone, location_type, status, capacity_units)
         VALUES ($1, $2, 'DESPACHO', 'Muelle de Despacho y Consolidación', 'DESP', 'dispatch', 'active', 2000)
         RETURNING id`,
        [companyId, whId]
      );
      locDispatchId = loc.rows[0].id;
    } else {
      locDispatchId = locDispatchRes.rows[0].id;
    }
    console.log(`  ✓ Bodega WH-QUITO con ubicaciones: Storage(A-01-01), Dispatch(DESPACHO)`);

    // ─── 3. PRODUCTOS Y PRECIOS ────────────────────────────────────────────────
    console.log('\n--- 3. CATÁLOGO DE PRODUCTOS ---');
    const productsDef = [
      { sku: 'SKU-LAP-01', name: 'Laptop Pro Enterprise 15.6" 16GB RAM 512GB SSD', category: 'tecnologia', pvp: 850.00, weight: 2.1, volume: 0.008 },
      { sku: 'SKU-MON-02', name: 'Monitor Ultrawide 34" IPS HDR 144Hz FreeSync', category: 'tecnologia', pvp: 420.00, weight: 6.8, volume: 0.045 },
    ];
    const productMap = {};
    for (const p of productsDef) {
      let prodRes = await client.query('SELECT id FROM products WHERE company_id = $1 AND sku = $2', [companyId, p.sku]);
      if (!prodRes.rowCount) {
        const ins = await client.query(
          `INSERT INTO products (company_id, sku, name, description, category, sale_price, price, iva_rate, weight_kg, volume_m3, is_active)
           VALUES ($1, $2, $3, $3, $4, $5, $5, 15, $6, $7, true)
           RETURNING id`,
          [companyId, p.sku, p.name, p.category, p.pvp, p.weight, p.volume]
        );
        productMap[p.sku] = ins.rows[0].id;
      } else {
        productMap[p.sku] = prodRes.rows[0].id;
      }
      console.log(`  ✓ Producto: ${p.sku} - ${p.name} (PVP: $${p.pvp})`);
    }

    // ─── 4. CICLO DE IMPORTACIÓN MARÍTIMA Y COSTEO PRORRATEADO ─────────────────
    console.log('\n--- 4. EXPEDIENTE DE IMPORTACIÓN, PRORRATEO DE GASTOS Y COSTEO ---');
    const importCode = 'IMP-2026-0042';
    await client.query("DELETE FROM imports WHERE company_id = $1 AND tracking_number = $2", [companyId, importCode]);
    
    // Crear Importación
    const impRes = await client.query(
      `INSERT INTO imports (
         company_id, supplier_id, tracking_number, bl_number, customs_declaration_number,
         origin_country, destination_country, shipping_method, port_of_origin, port_of_destination,
         status, cost_center_id, notes, total_cost
       ) VALUES ($1, $2, $3, 'MSKU-98234123', 'DAU-2026-000892', 'China', 'Ecuador', 'maritime', 'Shenzhen Port', 'Puerto de Guayaquil', 'IN_TRANSIT', $4, 'Importación directa contenedores tech Q4', 49000.00)
       RETURNING id`,
      [companyId, supplierMap['Shenzhen Tech & Hardware Corp.'], importCode, costCenterMap['CC-IMP']]
    );
    const importId = impRes.rows[0].id;
    console.log(`  ✓ Expediente de Importación creado: ${importCode} (ID: ${importId})`);

    // Líneas de la importación (FOB)
    // 100 Laptops @ $400.00 = $40,000
    const itemLapRes = await client.query(
      `INSERT INTO import_items (import_id, product_id, expected_quantity, unit_cost, batch_number, expiration_date)
       VALUES ($1, $2, 100, 400.0000, 'LOTE-IMP-LAP-001', '2028-12-31')
       RETURNING id`,
      [importId, productMap['SKU-LAP-01']]
    );
    const itemLapId = itemLapRes.rows[0].id;

    // 50 Monitores @ $180.00 = $9,000
    const itemMonRes = await client.query(
      `INSERT INTO import_items (import_id, product_id, expected_quantity, unit_cost, batch_number, expiration_date)
       VALUES ($1, $2, 50, 180.0000, 'LOTE-IMP-MON-001', '2028-12-31')
       RETURNING id`,
      [importId, productMap['SKU-MON-02']]
    );
    const itemMonId = itemMonRes.rows[0].id;
    console.log('  ✓ Items FOB registrados:');
    console.log('    - 100x Laptop @ $400.00 = $40,000.00');
    console.log('    -  50x Monitor @ $180.00 = $9,000.00');
    console.log('    - Subtotal FOB = $49,000.00');

    // Gastos Logísticos Reales para Prorrateo
    const logisticsCosts = [
      { concept: 'Flete Marítimo Internacional', amount: 2800.00, supplier: 'Pacific Shipping Lines Ltd.', type: 'freight' },
      { concept: 'Seguro de Carga Internacional', amount: 450.00, supplier: 'Pacific Shipping Lines Ltd.', type: 'insurance' },
      { concept: 'Aranceles Aduaneros (Ad-Valorem + Fodinfa)', amount: 3250.00, supplier: 'Agencia de Aduanas Integradas Ecuador S.A.', type: 'customs' },
      { concept: 'Almacenaje Portuario & Manipuleo Guayaquil', amount: 650.00, supplier: 'Pacific Shipping Lines Ltd.', type: 'handling' },
    ];

    let totalLogisticsExpenses = 0;
    for (const lc of logisticsCosts) {
      totalLogisticsExpenses += lc.amount;
      const costRes = await client.query(
        `INSERT INTO logistics_costs (
           company_id, supplier_id, source_type, source_id, cost_type,
           concept, estimated_amount, actual_amount, currency, ap_status
         ) VALUES ($1, $2, 'import', $3, $4, $5, $6, $6, 'USD', 'approved')
         RETURNING id`,
        [companyId, supplierMap[lc.supplier], importId, lc.type, lc.concept, lc.amount]
      );
      const costId = costRes.rows[0].id;

      // Ejecutar stored procedure de prorrateo por valor CIF
      await client.query(
        "SELECT allocate_logistics_import_cost($1, $2, $3, 'value')",
        [companyId, costId, importId]
      );
      console.log(`    + Distribuido gasto logístico: ${lc.concept} por $${lc.amount.toFixed(2)}`);
    }

    // Validar costos unitarios prorrateados resultantes
    const proratedRes = await client.query(
      `SELECT ii.id, p.sku, ii.expected_quantity, ii.unit_cost, ii.allocated_logistics_cost
       FROM import_items ii
       JOIN products p ON p.id = ii.product_id
       WHERE ii.import_id = $1`,
      [importId]
    );
    console.log('\n  ✓ Costos Finales Prorrateados en Expediente:');
    let totalImportValuation = 0;
    for (const row of proratedRes.rows) {
      const lineTotal = Number(row.expected_quantity) * Number(row.unit_cost);
      totalImportValuation += lineTotal;
      console.log(`    - ${row.sku}: ${row.expected_quantity} uds | Costo Unitario Final: $${Number(row.unit_cost).toFixed(4)} (Gastos Asignados: $${Number(row.allocated_logistics_cost).toFixed(2)}) | Total Línea: $${lineTotal.toFixed(2)}`);
    }
    console.log(`  ✓ Costo Total Importación (FOB $49,000 + Gastos $${totalLogisticsExpenses}): $${totalImportValuation.toFixed(2)}`);

    // ─── 5. RECEPCIÓN DE IMPORTACIÓN Y CREACIÓN DE CAPAS FIFO ───────────────────
    console.log('\n--- 5. RECEPCIÓN FORMAL EN BODEGA Y GENERACIÓN FIFO ---');
    const receiptNum = 'REC-2026-000101';
    const recHeader = await client.query(
      `INSERT INTO goods_receipts (
         company_id, receipt_number, source_type, source_id, supplier_id,
         target_warehouse_id, carrier_name, vehicle_plate, arrived_at, unloaded_at, status, created_by
       ) VALUES ($1, $2, 'import', $3, $4, $5, 'Transportes del Puerto S.A.', 'GAA-1234', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'in_progress', $6)
       RETURNING id`,
      [companyId, receiptNum, importId, supplierMap['Shenzhen Tech & Hardware Corp.'], whId, userId]
    );
    const receiptId = recHeader.rows[0].id;

    // Líneas de recepción e inspección aprobada
    for (const row of proratedRes.rows) {
      await client.query(
        `INSERT INTO goods_receipt_items (
           receipt_id, source_line_id, product_id, expected_quantity, received_quantity,
           damaged_quantity, unit_cost, quality_status, batch_number, expiration_date, temporary_location
         ) VALUES ($1, $2, (SELECT product_id FROM import_items WHERE id = $2), $3, $3, 0, $4, 'approved', 'LOTE-IMP-' || $3, '2028-12-31', 'A-01-01')`,
        [receiptId, row.id, row.expected_quantity, row.unit_cost]
      );
    }

    // Crear lotes e inventario físico en ubicación WMS
    for (const row of proratedRes.rows) {
      const prodId = (await client.query('SELECT product_id FROM import_items WHERE id = $1', [row.id])).rows[0].product_id;
      const bRes = await client.query(
        `INSERT INTO product_batches (product_id, import_id, batch_number, expiration_date, unit_cost)
         VALUES ($1, $2, 'LOTE-IMP-' || $3, '2028-12-31', $4)
         RETURNING id`,
        [prodId, importId, row.expected_quantity, row.unit_cost]
      );
      const batchId = bRes.rows[0].id;

      await client.query(
        `INSERT INTO inventory (batch_id, warehouse_id, storage_location_id, stock_status, quantity, bin_location)
         VALUES ($1, $2, $3, 'available', $4, 'A-01-01')
         ON CONFLICT (batch_id, warehouse_id, storage_location_id, stock_status)
         DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
        [batchId, whId, locStorageId, row.expected_quantity]
      );
    }

    // Cerrar Recepción formalmente -> Llama a sync_goods_receipt_to_enterprise_fifo
    await client.query(
      "UPDATE goods_receipts SET status = 'closed', closed_by = $1, closed_at = CURRENT_TIMESTAMP WHERE id = $2",
      [userId, receiptId]
    );
    await client.query(
      "SELECT sync_goods_receipt_to_enterprise_fifo($1, $2, $3)",
      [companyId, receiptId, userId]
    );
    console.log(`  ✓ Recepción cerrada exitosamente: ${receiptNum}`);

    // Verificar Capas FIFO generadas
    const fifoLayers1 = await client.query(
      `SELECT cl.id, p.sku, cl.initial_quantity, cl.remaining_quantity, cl.functional_unit_cost, cl.status
       FROM inventory_cost_layers cl
       JOIN products p ON p.id = cl.product_id
       WHERE cl.company_id = $1 AND cl.origin_doc_id = $2`,
      [companyId, receiptId]
    );
    console.log('  ✓ Capas de Costo FIFO Activas generadas:');
    for (const l of fifoLayers1.rows) {
      console.log(`    - Capa ID: ${l.id.slice(0,8)}... | ${l.sku} | Qty: ${l.remaining_quantity} | Costo FIFO: $${Number(l.functional_unit_cost).toFixed(4)} | Status: ${l.status}`);
    }

    // ─── 6. COMPRA LOCAL ADICIONAL (SEGUNDA CAPA FIFO) ─────────────────────────
    console.log('\n--- 6. COMPRA LOCAL NACIONAL Y SEGUNDA CAPA FIFO ---');
    const poNum = 'OC-2026-0001';
    const poRes = await client.query(
      `INSERT INTO purchase_orders (
         company_id, order_number, supplier_id, cost_center_id, status, expected_date, total_amount, payment_status, created_by
       ) VALUES ($1, $2, $3, $4, 'approved', CURRENT_DATE + 3, 9600.00, 'pending', $5)
       ON CONFLICT (company_id, order_number) DO UPDATE SET total_amount = EXCLUDED.total_amount
       RETURNING id`,
      [companyId, poNum, supplierMap['Distribuciones Industriales de la Sierra Cía. Ltda.'], costCenterMap['CC-COM'], userId]
    );
    const poId = poRes.rows[0].id;

    // 20 Laptops adicionales compradas a $480.00 c/u (costo local mayor)
    await client.query("DELETE FROM purchase_order_items WHERE purchase_order_id = $1", [poId]);
    const poItemRes = await client.query(
      `INSERT INTO purchase_order_items (
         purchase_order_id, product_id, ordered_quantity, received_quantity, unit_cost
       ) VALUES ($1, $2, 20, 20, 480.0000)
       RETURNING id`,
      [poId, productMap['SKU-LAP-01']]
    );
    console.log(`  ✓ Orden de Compra ${poNum}: 20 Laptops @ $480.00 = $9,600.00 (Total: $9,600.00)`);

    // Recepción de la compra local
    const recLocalRes = await client.query(
      `INSERT INTO goods_receipts (
         company_id, receipt_number, source_type, source_id, supplier_id,
         target_warehouse_id, carrier_name, arrived_at, status, created_by
       ) VALUES ($1, 'REC-LOC-2026-001', 'purchase_order', $2, $3, $4, 'Transportes Sierra', CURRENT_TIMESTAMP, 'in_progress', $5)
       RETURNING id`,
      [companyId, poId, supplierMap['Distribuciones Industriales de la Sierra Cía. Ltda.'], whId, userId]
    );
    const recLocalId = recLocalRes.rows[0].id;

    await client.query(
      `INSERT INTO goods_receipt_items (
         receipt_id, source_line_id, product_id, expected_quantity, received_quantity,
         damaged_quantity, unit_cost, quality_status, batch_number, expiration_date, temporary_location
       ) VALUES ($1, $2, $3, 20, 20, 0, 480.0000, 'approved', 'LOTE-LOC-LAP-002', '2028-12-31', 'A-01-01')`,
      [recLocalId, poItemRes.rows[0].id, productMap['SKU-LAP-01']]
    );

    const bLocalRes = await client.query(
      `INSERT INTO product_batches (product_id, batch_number, expiration_date, unit_cost)
       VALUES ($1, 'LOTE-LOC-LAP-002', '2028-12-31', 480.0000)
       RETURNING id`,
      [productMap['SKU-LAP-01']]
    );
    const bLocalId = bLocalRes.rows[0].id;

    await client.query(
      `INSERT INTO inventory (batch_id, warehouse_id, storage_location_id, stock_status, quantity, bin_location)
       VALUES ($1, $2, $3, 'available', 20, 'A-01-01')
       ON CONFLICT (batch_id, warehouse_id, storage_location_id, stock_status)
       DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
      [bLocalId, whId, locStorageId]
    );

    await client.query(
      "UPDATE goods_receipts SET status = 'closed', closed_by = $1, closed_at = CURRENT_TIMESTAMP WHERE id = $2",
      [userId, recLocalId]
    );
    await client.query(
      "SELECT sync_goods_receipt_to_enterprise_fifo($1, $2, $3)",
      [companyId, recLocalId, userId]
    );
    console.log('  ✓ Recepción local cerrada. Creada Capa 2 FIFO de Laptop: 20 uds @ $480.00');

    // ─── 7. VENTA MAYORISTA Y CONSUMO FIFO ─────────────────────────────────────
    console.log('\n--- 7. VENTA MAYORISTA, CONSUMO MULTICAPA FIFO Y COGS ---');
    // Cliente Corporativo
    let custRes = await client.query("SELECT id FROM customers WHERE company_id = $1 AND tax_id = '0190123456001'", [companyId]);
    let customerId;
    if (!custRes.rowCount) {
      const c = await client.query(
        `INSERT INTO customers (
           company_id, name, commercial_name, tax_id, customer_type, email, phone, address, city, credit_limit, is_active
         ) VALUES ($1, 'Corporación Comercial del Austro S.A.', 'Comercial Austro', '0190123456001', 'wholesale', 'compras@austro.com.ec', '+593-7-2800000', 'Av. Huayna Cápac y Gil Ramírez Dávalos', 'Cuenca', 120000.00, true)
         RETURNING id`,
        [companyId]
      );
      customerId = c.rows[0].id;
    } else {
      customerId = custRes.rows[0].id;
    }

    // Venta: 110 Laptops (consumirá 100 de Capa 1 y 10 de Capa 2) + 30 Monitores
    const saleNum = 'VTA-2026-000099';
    await client.query("DELETE FROM sales WHERE company_id = $1 AND sale_number = $2", [companyId, saleNum]);

    // Subtotal: 110*850 = $93,500; 30*420 = $12,600. Total = $106,100
    // Descuento: 5% ($5,305.00) -> Base: $100,795.00. IVA 15%: $15,119.25. Total: $115,914.25
    const saleRes = await client.query(
      `INSERT INTO sales (
         company_id, branch_id, sale_number, customer_id, sale_date, status, payment_status,
         subtotal, discount, tax, total_amount, cost_center_id, notes
       ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 'completed', 'pending', 106100.00, 5305.00, 15119.25, 115914.25, $5, 'Venta mayorista Austro Q4')
       RETURNING id`,
      [companyId, branchId, saleNum, customerId, costCenterMap['CC-COM']]
    );
    const saleId = saleRes.rows[0].id;

    // Obtener los lotes disponibles
    const lapBatches = await client.query(
      `SELECT b.id AS batch_id, b.unit_cost, i.id AS inventory_id, i.quantity
       FROM inventory i
       JOIN product_batches b ON b.id = i.batch_id
       WHERE b.product_id = $1 AND i.warehouse_id = $2 AND i.quantity > 0
       ORDER BY b.created_at ASC`,
      [productMap['SKU-LAP-01'], whId]
    );

    // Consumir 110 Laptops en sales_items
    let qtyLapNeeded = 110;
    let lapTotalCost = 0;
    for (const b of lapBatches.rows) {
      if (qtyLapNeeded <= 0) break;
      const take = Math.min(qtyLapNeeded, Number(b.quantity));
      await client.query('UPDATE inventory SET quantity = quantity - $1 WHERE id = $2', [take, b.inventory_id]);
      await client.query(
        `INSERT INTO sales_items (
           sale_id, batch_id, inventory_id, storage_location_id, quantity, unit_price, discount, total_amount, tax_rate, tax_amount
         ) VALUES ($1, $2, $3, $4, $5, 850.00, 5, $6, 15, $7)`,
        [saleId, b.batch_id, b.inventory_id, locStorageId, take, take * 850 * 0.95, take * 850 * 0.95 * 0.15]
      );
      lapTotalCost += take * Number(b.unit_cost);
      qtyLapNeeded -= take;
    }

    // Obtener lote de Monitores y consumir 30
    const monBatch = await client.query(
      `SELECT b.id AS batch_id, b.unit_cost, i.id AS inventory_id, i.quantity
       FROM inventory i
       JOIN product_batches b ON b.id = i.batch_id
       WHERE b.product_id = $1 AND i.warehouse_id = $2 AND i.quantity > 0
       ORDER BY b.created_at ASC LIMIT 1`,
      [productMap['SKU-MON-02'], whId]
    );
    await client.query('UPDATE inventory SET quantity = quantity - 30 WHERE id = $1', [monBatch.rows[0].inventory_id]);
    await client.query(
      `INSERT INTO sales_items (
         sale_id, batch_id, inventory_id, storage_location_id, quantity, unit_price, discount, total_amount, tax_rate, tax_amount
       ) VALUES ($1, $2, $3, $4, 30, 420.00, 5, $5, 15, $6)`,
      [saleId, monBatch.rows[0].batch_id, monBatch.rows[0].inventory_id, locStorageId, 30 * 420 * 0.95, 30 * 420 * 0.95 * 0.15]
    );
    const monTotalCost = 30 * Number(monBatch.rows[0].unit_cost);

    const totalCogs = lapTotalCost + monTotalCost;
    const grossMargin = 100795.00 - totalCogs;
    await client.query(
      `UPDATE sales SET cogs_total = $1, gross_margin = $2 WHERE id = $3`,
      [totalCogs, grossMargin, saleId]
    );
    console.log(`  ✓ Venta ${saleNum} Procesada:`);
    console.log(`    - Ingreso Neto (sin IVA): $100,795.00`);
    console.log(`    - Costo de Ventas (COGS): $${totalCogs.toFixed(2)}`);
    console.log(`    - Margen Bruto: $${grossMargin.toFixed(2)} (${((grossMargin / 100795) * 100).toFixed(1)}%)`);

    // Consumo FIFO a nivel de inventory_cost_layers:
    // Capa 1 de Laptop (100 uds): Se consume completa
    const lapLayers = await client.query(
      `SELECT id, remaining_quantity, functional_unit_cost FROM inventory_cost_layers
       WHERE company_id = $1 AND product_id = $2 AND status = 'active'
       ORDER BY effective_date ASC, created_at ASC`,
      [companyId, productMap['SKU-LAP-01']]
    );
    let remLap = 110;
    for (const l of lapLayers.rows) {
      if (remLap <= 0) break;
      const consume = Math.min(remLap, Number(l.remaining_quantity));
      const newRem = Number(l.remaining_quantity) - consume;
      await client.query(
        `UPDATE inventory_cost_layers SET remaining_quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [newRem, newRem === 0 ? 'exhausted' : 'active', l.id]
      );
      remLap -= consume;
    }

    // Capa de Monitor: Se consumen 30 unidades
    const monLayers = await client.query(
      `SELECT id, remaining_quantity FROM inventory_cost_layers
       WHERE company_id = $1 AND product_id = $2 AND status = 'active'
       ORDER BY effective_date ASC LIMIT 1`,
      [companyId, productMap['SKU-MON-02']]
    );
    if (monLayers.rowCount) {
      const newRemMon = Number(monLayers.rows[0].remaining_quantity) - 30;
      await client.query(
        `UPDATE inventory_cost_layers SET remaining_quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [newRemMon, newRemMon === 0 ? 'exhausted' : 'active', monLayers.rows[0].id]
      );
    }

    // Actualizar inventory_balances
    await client.query(
      `UPDATE inventory_balances SET physical_stock = physical_stock - 110, available_stock = available_stock - 110
       WHERE company_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [companyId, whId, productMap['SKU-LAP-01']]
    );
    await client.query(
      `UPDATE inventory_balances SET physical_stock = physical_stock - 30, available_stock = available_stock - 30
       WHERE company_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [companyId, whId, productMap['SKU-MON-02']]
    );

    // ─── 8. PREPARACIÓN Y DESPACHO FÍSICO ──────────────────────────────────────
    console.log('\n--- 8. PREPARACIÓN, EMPAQUE Y SALIDA DE DESPACHO ---');
    const prepRes = await client.query(
      `INSERT INTO fulfillment_orders (
         company_id, sale_id, fulfillment_number, status, picking_strategy, priority, recipient_name, shipping_city, created_by
       ) VALUES ($1, $2, 'PRE-2026-000099', 'dispatched', 'fefo', 'urgent', 'Corporación Austro - Bodega Central', 'Cuenca', $3)
       RETURNING id`,
      [companyId, saleId, userId]
    );
    const fulfillId = prepRes.rows[0].id;

    // Despacho físico
    const dspRes = await client.query(
      `INSERT INTO dispatch_events (
         fulfillment_order_id, dispatch_number, carrier_name, driver_name, vehicle_plate, tracking_number, document_reference, dispatched_by
       ) VALUES ($1, 'DSP-2026-000099', 'Flota Corporativa Importadora', 'Manuel Morales', 'PBG-4589', 'TRK-CUENCA-99', 'GUIA-REM-001-002-00098', $2)
       RETURNING id`,
      [fulfillId, userId]
    );
    console.log(`  ✓ Pedido de Despacho ${dspRes.rows[0].id.slice(0,8)} confirmado con Guía de Remisión`);

    // ─── 9. COBRANZAS Y PAGOS A PROVEEDORES ────────────────────────────────────
    console.log('\n--- 9. ENLACE DE COBROS, PAGOS Y CENTROS DE COSTO ---');
    // Cobro Parcial de Venta: $60,000.00
    await client.query(
      `INSERT INTO sale_payments (sale_id, method, amount, reference, cost_center_id)
       VALUES ($1, 'transfer', 60000.00, 'TRANS-PICHINCHA-88291', $2)`,
      [saleId, costCenterMap['CC-COM']]
    );
    await client.query("UPDATE sales SET payment_status = 'partial' WHERE id = $1", [saleId]);
    console.log('  ✓ Cobranza Registrada: $60,000.00 recibidos de Corp. Austro (Saldo pendiente: $55,914.25)');

    // Pagos a Proveedores
    const suppPayments = [
      { sup: 'Pacific Shipping Lines Ltd.', amount: 2800.00, cc: 'CC-IMP', ref: 'PAGO-FLETE-MSKU', import_id: importId },
      { sup: 'Agencia de Aduanas Integradas Ecuador S.A.', amount: 3250.00, cc: 'CC-IMP', ref: 'PAGO-ADUANA-DAU', import_id: importId },
      { sup: 'Distribuciones Industriales de la Sierra Cía. Ltda.', amount: 9600.00, cc: 'CC-COM', ref: 'PAGO-OC-0001', po_id: poId },
    ];

    for (const sp of suppPayments) {
      await client.query(
        `INSERT INTO supplier_payments (
           company_id, supplier_id, import_id, purchase_order_id, cost_center_id, amount, payment_method, reference, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, 'transfer', $7, $8)`,
        [companyId, supplierMap[sp.sup], sp.import_id || null, sp.po_id || null, costCenterMap[sp.cc], sp.amount, sp.ref, userId]
      );
      console.log(`  ✓ Pago a Proveedor: $${sp.amount.toFixed(2)} a ${sp.sup} [${sp.cc}]`);
    }
    await client.query("UPDATE purchase_orders SET payment_status = 'paid' WHERE id = $1", [poId]);

    // Gasto Operativo Administrativo
    await client.query(
      `INSERT INTO expenses (company_id, branch_id, description, amount, category, date, cost_center_id, user_id)
       VALUES ($1, $2, 'Licencias ERP Cloud y Servidores Mes Noviembre', 1250.00, 'technology', CURRENT_DATE, $3, $4)`,
      [companyId, branchId, costCenterMap['CC-ADM'], userId]
    );
    console.log('  ✓ Gasto Operativo Registrado: $1,250.00 en CC-ADM');

    // ─── 10. REPORTE OPERATIVO EN VIVO ─────────────────────────────────────────
    console.log('\n================================================================');
    console.log('📊 RESULTADOS DE LOS 5 REPORTES OPERATIVOS');
    console.log('================================================================\n');

    // 1. Purchases & Imports Report
    console.log('1️⃣ REPORTE DE COMPRAS E IMPORTACIONES:');
    const repPurch = await client.query(
      `SELECT 
         COUNT(DISTINCT i.id)::int AS total_imports,
         COALESCE(SUM(i.total_cost), 0)::numeric(15,2) AS imports_total_cif,
         COALESCE((SELECT SUM(po.total_amount) FROM purchase_orders po WHERE po.company_id = $1), 0)::numeric(15,2) AS purchases_total
       FROM imports i WHERE i.company_id = $1`,
      [companyId]
    );
    console.log(`   - Total Expedientes Importación: ${repPurch.rows[0].total_imports}`);
    console.log(`   - Total Costo CIF + Logística Importada: $${repPurch.rows[0].imports_total_cif}`);
    console.log(`   - Total Órdenes de Compra Locales: $${repPurch.rows[0].purchases_total}\n`);

    // 2. Inventory & FIFO Valuation Report
    console.log('2️⃣ REPORTE DE INVENTARIO Y VALORACIÓN FIFO:');
    const repFifo = await client.query(
      `SELECT 
         p.sku, p.name,
         COALESCE(b.physical_stock, 0) AS saldo_fisico,
         COALESCE(b.available_stock, 0) AS saldo_disponible,
         COALESCE(SUM(cl.remaining_quantity * cl.functional_unit_cost), 0)::numeric(15,2) AS valoracion_fifo,
         COUNT(cl.id) FILTER (WHERE cl.status = 'active') AS capas_activas
       FROM products p
       LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.warehouse_id = $2
       LEFT JOIN inventory_cost_layers cl ON cl.product_id = p.id AND cl.status = 'active'
       WHERE p.company_id = $1
       GROUP BY p.sku, p.name, b.physical_stock, b.available_stock
       ORDER BY p.sku`,
      [companyId, whId]
    );
    for (const r of repFifo.rows) {
      console.log(`   - ${r.sku}: Stock Físico: ${r.saldo_fisico} uds | Valoración FIFO: $${r.valoracion_fifo} (${r.capas_activas} capas activas)`);
    }

    // 3. Sales & Gross Margin Report
    console.log('\n3️⃣ REPORTE DE VENTAS Y MARGEN BRUTO:');
    const repSales = await client.query(
      `SELECT 
         COUNT(id)::int AS total_ventas,
         COALESCE(SUM(total_amount), 0)::numeric(15,2) AS facturado_con_iva,
         COALESCE(SUM(subtotal - discount), 0)::numeric(15,2) AS ingreso_neto,
         COALESCE(SUM(cogs_total), 0)::numeric(15,2) AS costo_ventas_cogs,
         COALESCE(SUM(gross_margin), 0)::numeric(15,2) AS margen_bruto_dolares,
         CASE WHEN SUM(subtotal - discount) > 0 THEN 
           ROUND((SUM(gross_margin) / SUM(subtotal - discount) * 100)::numeric, 2)
         ELSE 0 END AS margen_bruto_porcentaje
       FROM sales WHERE company_id = $1 AND status = 'completed'`,
      [companyId]
    );
    const sRow = repSales.rows[0];
    console.log(`   - Ventas Realizadas: ${sRow.total_ventas}`);
    console.log(`   - Total Facturado: $${sRow.facturado_con_iva} (Ingreso Neto: $${sRow.ingreso_neto})`);
    console.log(`   - Costo de Mercancía Vendida (COGS): $${sRow.costo_ventas_cogs}`);
    console.log(`   - Margen Bruto: $${sRow.margen_bruto_dolares} (${sRow.margen_bruto_porcentaje}% de rentabilidad)\n`);

    // 4. Receivables & Payables Aging Report
    console.log('4️⃣ REPORTE DE CARTERA Y CUENTAS POR PAGAR (AGING):');
    const repAging = await client.query(
      `SELECT 
         COALESCE(SUM(s.total_amount - COALESCE(p.paid, 0)), 0)::numeric(15,2) AS cuentas_por_cobrar
       FROM sales s
       LEFT JOIN (SELECT sale_id, SUM(amount) AS paid FROM sale_payments GROUP BY sale_id) p ON p.sale_id = s.id
       WHERE s.company_id = $1 AND s.payment_status != 'paid'`,
      [companyId]
    );
    console.log(`   - Total Cartera por Cobrar Clientes: $${repAging.rows[0].cuentas_por_cobrar}`);

    // 5. Cost Centers Operational Report
    console.log('\n5️⃣ REPORTE POR CENTROS DE COSTO:');
    const repCC = await client.query(
      `SELECT 
         cc.code, cc.name, cc.budget_amount,
         COALESCE(e.total_expenses, 0)::numeric(15,2) AS gastos_operativos,
         COALESCE(s.total_sales, 0)::numeric(15,2) AS ventas_asignadas,
         COALESCE(s.total_gross_margin, 0)::numeric(15,2) AS margen_generado,
         (cc.budget_amount - COALESCE(e.total_expenses, 0))::numeric(15,2) AS saldo_presupuestario
       FROM cost_centers cc
       LEFT JOIN (
         SELECT cost_center_id, SUM(amount) AS total_expenses 
         FROM expenses WHERE company_id = $1 GROUP BY cost_center_id
       ) e ON e.cost_center_id = cc.id
       LEFT JOIN (
         SELECT cost_center_id, SUM(total_amount) AS total_sales, SUM(gross_margin) AS total_gross_margin
         FROM sales WHERE company_id = $1 AND status = 'completed' GROUP BY cost_center_id
       ) s ON s.cost_center_id = cc.id
       WHERE cc.company_id = $1
       ORDER BY cc.code`,
      [companyId]
    );
    for (const r of repCC.rows) {
      console.log(`   - [${r.code}] ${r.name}:`);
      console.log(`     Presupuesto: $${r.budget_amount} | Gastos: $${r.gastos_operativos} | Saldo: $${r.saldo_presupuestario} | Margen Ventas: $${r.margen_generado}`);
    }

    console.log('\n================================================================');
    console.log('✅ PILOTO EMPRESARIAL COMPLETADO CON ÉXITO AL 100%');
    console.log('================================================================\n');

  } catch (error) {
    console.error('❌ ERROR EN EL PILOTO:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runEnterprisePilot();
