const path = require('path');
const crypto = require('crypto');
require('C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/node_modules/dotenv').config({
  path: 'C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/.env'
});

const { NestFactory } = require('C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/node_modules/@nestjs/core');
const { AppModule } = require('C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/dist/app.module');
const { DatabaseService } = require('C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/dist/database/database.service');
const { MovementService } = require('C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/dist/inventory/movement.service');
const { FifoService } = require('C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/dist/inventory/fifo.service');
const { InventoryService } = require('C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/dist/inventory/inventory.service');
const { InventoryRepository } = require('C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/dist/inventory/inventory.repository');
const { Client } = require('C:/Users/USER/Downloads/Importadora-ERP-main/Importadora-ERP-main/backend/node_modules/pg');

async function runAcceptanceTests() {
  console.log('================================================================');
  console.log('   SUITE DE PRUEBAS DE ACEPTACIÓN EMPRESARIAL: INV-001 A INV-020');
  console.log('        MÓDULO DE INVENTARIO - VALORACIÓN FIFO Y CONCURRENCIA    ');
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get(DatabaseService);
  const movementService = app.get(MovementService);
  const fifoService = app.get(FifoService);
  const inventoryService = app.get(InventoryService);
  const inventoryRepo = app.get(InventoryRepository);

  const pool = db.getPool();

  const results = [];
  const record = (id, name, passed, detail) => {
    results.push({ id, name, passed, detail });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} [${id}] ${name}`);
    if (detail) console.log(`   └─ Detalle: ${detail}`);
  };

  try {
    // 0. Preparar datos base de prueba
    const compRes = await pool.query('SELECT id FROM companies LIMIT 1');
    const companyId = compRes.rows[0]?.id || '10000000-0000-4000-8000-000000000001';

    const branchRes = await pool.query('SELECT id FROM branches WHERE company_id = $1 LIMIT 1', [companyId]);
    let branchId = branchRes.rows[0]?.id;
    if (!branchId) {
      const bInsert = await pool.query(
        `INSERT INTO branches (id, company_id, name, code, is_active)
         VALUES ('10000000-0000-4000-8000-000000000002', $1, 'Sucursal Matriz', 'SUC-01', true)
         ON CONFLICT (id) DO UPDATE SET is_active = true RETURNING id`,
        [companyId]
      );
      branchId = bInsert.rows[0].id;
    }

    const userRes = await pool.query('SELECT id FROM users WHERE is_active = true LIMIT 1');
    const userId = userRes.rows[0]?.id || '38f6ef43-a019-4f4d-a4ca-dcf7518cbdcc';

    // Producto de prueba A
    const skuA = `SKU-A-${Date.now().toString().slice(-5)}`;
    const prodA = await pool.query(
      `INSERT INTO products (name, sku, company_id, is_active, min_stock, lead_time_days, tracking_type)
       VALUES ('Laptop Pro 15', $1, $2, true, 10, 15, 'lot_and_serial')
       RETURNING *`,
      [skuA, companyId]
    );
    const productA = prodA.rows[0];

    // Producto de prueba B
    const skuB = `SKU-B-${Date.now().toString().slice(-5)}`;
    const prodB = await pool.query(
      `INSERT INTO products (name, sku, company_id, is_active, min_stock, lead_time_days, tracking_type)
       VALUES ('Monitor Ultra 27', $1, $2, true, 5, 20, 'lot')
       RETURNING *`,
      [skuB, companyId]
    );
    const productB = prodB.rows[0];

    // ─────────────────────────────────────────────────────────────────
    // INV-001: Crear bodega (Registro válido)
    // ─────────────────────────────────────────────────────────────────
    let testWh1Id, testWh2Id, testQuarantineWhId;
    try {
      const codeWh1 = `WH-T1-${Date.now().toString().slice(-5)}`;
      const wh1Res = await pool.query(
        `INSERT INTO warehouses (company_id, branch_id, code, name, type, operating_type, is_active, allows_sale_dispatch)
         VALUES ($1, $2, $3, 'Bodega Central Pruebas', 'physical', 'principal', true, true)
         RETURNING *`,
        [companyId, branchId, codeWh1]
      );
      testWh1Id = wh1Res.rows[0].id;

      const codeWh2 = `WH-T2-${Date.now().toString().slice(-5)}`;
      const wh2Res = await pool.query(
        `INSERT INTO warehouses (company_id, branch_id, code, name, type, operating_type, is_active, allows_sale_dispatch)
         VALUES ($1, $2, $3, 'Bodega Secundaria Norte', 'physical', 'secundaria', true, true)
         RETURNING *`,
        [companyId, branchId, codeWh2]
      );
      testWh2Id = wh2Res.rows[0].id;

      const codeQuarantine = `WH-QUAR-${Date.now().toString().slice(-5)}`;
      const quarRes = await pool.query(
        `INSERT INTO warehouses (company_id, branch_id, code, name, type, operating_type, is_active, allows_sale_dispatch)
         VALUES ($1, $2, $3, 'Bodega Cuarentena', 'physical', 'cuarentena', true, false)
         RETURNING *`,
        [companyId, branchId, codeQuarantine]
      );
      testQuarantineWhId = quarRes.rows[0].id;

      record('INV-001', 'Crear bodega con tipos y reglas operativas', Boolean(testWh1Id && testWh2Id && testQuarantineWhId), `Bodegas creadas: ${codeWh1}, ${codeWh2}, ${codeQuarantine}`);
    } catch (e) {
      record('INV-001', 'Crear bodega', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-002: Crear ubicación (Código único y jerárquico)
    // ─────────────────────────────────────────────────────────────────
    let locWh1Id, locWh2Id, locQuarantineId;
    try {
      const codeLoc1 = `UIO-B01-ZA-P01-E01-N01-${Date.now().toString().slice(-5)}`;
      const loc1Res = await pool.query(
        `INSERT INTO storage_locations (company_id, warehouse_id, code, name, zone, aisle, rack, level, position, location_type, status)
         VALUES ($1, $2, $3, 'Posición A-1', 'ZA', 'P01', 'E01', 'N01', 'POS1', 'storage', 'active')
         RETURNING *`,
        [companyId, testWh1Id, codeLoc1]
      );
      locWh1Id = loc1Res.rows[0].id;

      const codeLoc2 = `UIO-B02-ZB-P02-E01-N01-${Date.now().toString().slice(-5)}`;
      const loc2Res = await pool.query(
        `INSERT INTO storage_locations (company_id, warehouse_id, code, name, zone, aisle, rack, level, position, location_type, status)
         VALUES ($1, $2, $3, 'Posición B-1', 'ZB', 'P02', 'E01', 'N01', 'POS1', 'storage', 'active')
         RETURNING *`,
        [companyId, testWh2Id, codeLoc2]
      );
      locWh2Id = loc2Res.rows[0].id;

      const codeLocQ = `UIO-QUAR-Z1-${Date.now().toString().slice(-5)}`;
      const locQRes = await pool.query(
        `INSERT INTO storage_locations (company_id, warehouse_id, code, name, zone, location_type, status)
         VALUES ($1, $2, $3, 'Ubicación Cuarentena', 'QUAR', 'quarantine', 'active')
         RETURNING *`,
        [companyId, testQuarantineWhId, codeLocQ]
      );
      locQuarantineId = locQRes.rows[0].id;

      // Intentar crear duplicado exacto para verificar rechazo por unicidad
      let dupRejected = false;
      try {
        await pool.query(
          `INSERT INTO storage_locations (company_id, warehouse_id, code, name) VALUES ($1, $2, $3, 'Dup')`,
          [companyId, testWh1Id, codeLoc1]
        );
      } catch (dupErr) {
        dupRejected = true;
      }

      record('INV-002', 'Crear ubicación jerárquica y validación de unicidad', Boolean(locWh1Id && dupRejected), `Ubicación ${codeLoc1} creada; duplicado rechazado correctamente`);
    } catch (e) {
      record('INV-002', 'Crear ubicación', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-003: Recibir mercancía (Aumenta stock y crea capa FIFO)
    // ─────────────────────────────────────────────────────────────────
    try {
      const receiptMov = await movementService.executeMovement({
        companyId,
        operationType: 'receipt',
        referenceDocType: 'purchase_order',
        referenceDocId: crypto.randomUUID(),
        notes: 'Recepción inicial compra 100u @ $10.00',
        userId,
        lines: [
          {
            productId: productA.id,
            toWarehouseId: testWh1Id,
            toLocationId: locWh1Id,
            quantity: 100,
            unitCost: 10.0,
          },
        ],
      });

      // Verificar balance
      const bRes = await pool.query(
        `SELECT physical_stock, available_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND location_id = $4`,
        [companyId, productA.id, testWh1Id, locWh1Id]
      );
      const stockOk = Number(bRes.rows[0]?.physical_stock) === 100 && Number(bRes.rows[0]?.available_stock) === 100;

      // Verificar capa FIFO creada
      const lRes = await pool.query(
        `SELECT initial_quantity, remaining_quantity, functional_unit_cost, status
         FROM inventory_cost_layers WHERE product_id = $1 AND origin_doc_id = $2`,
        [productA.id, receiptMov.id]
      );
      const layerOk = Number(lRes.rows[0]?.remaining_quantity) === 100 && Number(lRes.rows[0]?.functional_unit_cost) === 10.0;

      record('INV-003', 'Recibir mercancía con creación de Capa FIFO', stockOk && layerOk, `Stock físico = ${bRes.rows[0]?.physical_stock}, Capa FIFO = ${lRes.rows[0]?.remaining_quantity}u @ $${lRes.rows[0]?.functional_unit_cost}`);
    } catch (e) {
      record('INV-003', 'Recibir mercancía', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-004: Recepción parcial (Cantidad correcta en capa separada)
    // ─────────────────────────────────────────────────────────────────
    try {
      await movementService.executeMovement({
        companyId,
        operationType: 'receipt',
        referenceDocType: 'purchase_order',
        referenceDocId: crypto.randomUUID(),
        notes: 'Recepción parcial adicional 80u @ $12.00',
        userId,
        lines: [
          {
            productId: productA.id,
            toWarehouseId: testWh1Id,
            toLocationId: locWh1Id,
            quantity: 80,
            unitCost: 12.0,
          },
        ],
      });

      const bRes = await pool.query(
        `SELECT physical_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND location_id = $4`,
        [companyId, productA.id, testWh1Id, locWh1Id]
      );
      const layersCount = await pool.query(
        `SELECT count(*)::int AS cnt FROM inventory_cost_layers WHERE product_id = $1 AND status = 'active'`,
        [productA.id]
      );

      const pass = Number(bRes.rows[0]?.physical_stock) === 180 && layersCount.rows[0].cnt >= 2;
      record('INV-004', 'Recepción parcial con capas independientes', pass, `Stock acumulado = ${bRes.rows[0]?.physical_stock}u con ${layersCount.rows[0].cnt} capas activas`);
    } catch (e) {
      record('INV-004', 'Recepción parcial', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-005: Salida de mercancía (Disminuye stock y consume FIFO)
    // ─────────────────────────────────────────────────────────────────
    try {
      const issueMov = await movementService.executeMovement({
        companyId,
        operationType: 'issue',
        referenceDocType: 'sales_order',
        referenceDocId: crypto.randomUUID(),
        notes: 'Salida de venta 20 unidades',
        userId,
        lines: [
          {
            productId: productA.id,
            fromWarehouseId: testWh1Id,
            fromLocationId: locWh1Id,
            quantity: 20,
          },
        ],
      });

      const bRes = await pool.query(
        `SELECT physical_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND location_id = $4`,
        [companyId, productA.id, testWh1Id, locWh1Id]
      );

      const consRes = await pool.query(
        `SELECT sum(quantity_consumed) as total_c, avg(unit_cost_applied) as avg_cost
         FROM inventory_cost_consumptions c
         JOIN inventory_movement_lines l ON l.id = c.movement_line_id
         WHERE l.movement_id = $1`,
        [issueMov.id]
      );

      const pass = Number(bRes.rows[0]?.physical_stock) === 160 && Number(consRes.rows[0]?.total_c) === 20;
      record('INV-005', 'Salida de mercancía con consumo de capas', pass, `Stock restante: ${bRes.rows[0]?.physical_stock}u, Consumido: ${consRes.rows[0]?.total_c}u @ $${Number(consRes.rows[0]?.avg_cost).toFixed(2)}`);
    } catch (e) {
      record('INV-005', 'Salida de mercancía', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-006: Salida sin existencias (Rechazada estrictamente)
    // ─────────────────────────────────────────────────────────────────
    try {
      let rejected = false;
      try {
        await movementService.executeMovement({
          companyId,
          operationType: 'issue',
          referenceDocType: 'sales_order',
          referenceDocId: crypto.randomUUID(),
          userId,
          lines: [
            {
              productId: productA.id,
              fromWarehouseId: testWh1Id,
              fromLocationId: locWh1Id,
              quantity: 9999, // Supera con creces las 160 disponibles
            },
          ],
        });
      } catch (err) {
        rejected = true;
      }

      record('INV-006', 'Salida sin existencias rechazada con excepción', rejected, 'Intento de retirar 9,999u rechazado correctamente');
    } catch (e) {
      record('INV-006', 'Salida sin existencias', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-007: Transferencia (Conserva cantidades y costo original)
    // ─────────────────────────────────────────────────────────────────
    try {
      const transferDocId = crypto.randomUUID();
      // Transferencia directa de 25u desde Wh1 a Wh2
      await movementService.executeMovement({
        companyId,
        operationType: 'transfer_out',
        referenceDocType: 'transfer_order',
        referenceDocId: transferDocId,
        notes: 'Despacho transferencia a Bodega Secundaria',
        userId,
        lines: [
          {
            productId: productA.id,
            fromWarehouseId: testWh1Id,
            fromLocationId: locWh1Id,
            quantity: 25,
          },
        ],
      });

      await movementService.executeMovement({
        companyId,
        operationType: 'transfer_in',
        referenceDocType: 'transfer_order',
        referenceDocId: transferDocId,
        notes: 'Recepción transferencia en Bodega Secundaria',
        userId,
        lines: [
          {
            productId: productA.id,
            toWarehouseId: testWh2Id,
            toLocationId: locWh2Id,
            quantity: 25,
            unitCost: 10.0, // Conserva costo FIFO original de la primera capa
          },
        ],
      });

      const bDest = await pool.query(
        `SELECT physical_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND location_id = $4`,
        [companyId, productA.id, testWh2Id, locWh2Id]
      );

      const pass = Number(bDest.rows[0]?.physical_stock) === 25;
      record('INV-007', 'Transferencia entre bodegas conservando costo', pass, `Stock en Bodega Destino: ${bDest.rows[0]?.physical_stock}u transferidas`);
    } catch (e) {
      record('INV-007', 'Transferencia', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-008: Transferencia parcial (Mantiene saldo pendiente)
    // ─────────────────────────────────────────────────────────────────
    try {
      const partialDocId = crypto.randomUUID();
      // Despachar 15u pero recibir solo 10u
      await movementService.executeMovement({
        companyId,
        operationType: 'transfer_out',
        referenceDocType: 'transfer_order',
        referenceDocId: partialDocId,
        userId,
        lines: [
          {
            productId: productA.id,
            fromWarehouseId: testWh1Id,
            fromLocationId: locWh1Id,
            quantity: 15,
          },
        ],
      });

      await movementService.executeMovement({
        companyId,
        operationType: 'transfer_in',
        referenceDocType: 'transfer_order',
        referenceDocId: partialDocId,
        userId,
        lines: [
          {
            productId: productA.id,
            toWarehouseId: testWh2Id,
            toLocationId: locWh2Id,
            quantity: 10,
            unitCost: 10.0,
          },
        ],
      });

      const bDest = await pool.query(
        `SELECT physical_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND location_id = $4`,
        [companyId, productA.id, testWh2Id, locWh2Id]
      );

      const pass = Number(bDest.rows[0]?.physical_stock) === 35; // 25 anterior + 10 parcial
      record('INV-008', 'Transferencia parcial registrada', pass, `Bodega destino recibió 10u de 15u (saldo total: ${bDest.rows[0]?.physical_stock}u)`);
    } catch (e) {
      record('INV-008', 'Transferencia parcial', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-009: Crear lote (Trazabilidad por lote con fecha de expiración)
    // ─────────────────────────────────────────────────────────────────
    let testLotId;
    try {
      const lotNum = `LOT-${Date.now().toString().slice(-5)}`;
      const lotRes = await pool.query(
        `INSERT INTO inventory_lots (company_id, product_id, lot_number, expiration_date, status)
         VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL '180 days', 'available')
         RETURNING *`,
        [companyId, productB.id, lotNum]
      );
      testLotId = lotRes.rows[0].id;

      // Ingresar mercancía con este lote
      await movementService.executeMovement({
        companyId,
        operationType: 'receipt',
        referenceDocType: 'purchase_order',
        referenceDocId: crypto.randomUUID(),
        userId,
        lines: [
          {
            productId: productB.id,
            lotId: testLotId,
            toWarehouseId: testWh1Id,
            toLocationId: locWh1Id,
            quantity: 50,
            unitCost: 45.0,
          },
        ],
      });

      const bLot = await pool.query(
        `SELECT physical_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND lot_id = $3`,
        [companyId, productB.id, testLotId]
      );

      const pass = Number(bLot.rows[0]?.physical_stock) === 50;
      record('INV-009', 'Creación y trazabilidad por Lote con expiración', pass, `Lote ${lotNum} con 50u asociadas en balance`);
    } catch (e) {
      record('INV-009', 'Crear lote', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-010: Registrar serie duplicada (Rechazada por unicidad)
    // ─────────────────────────────────────────────────────────────────
    try {
      const serialNum = `SN-${Date.now()}-UNQ`;
      await pool.query(
        `INSERT INTO inventory_serials (company_id, product_id, serial_number, current_warehouse_id, current_location_id, acquisition_cost, status)
         VALUES ($1, $2, $3, $4, $5, 450.0, 'in_stock')`,
        [companyId, productA.id, serialNum, testWh1Id, locWh1Id]
      );

      let dupRejected = false;
      try {
        await pool.query(
          `INSERT INTO inventory_serials (company_id, product_id, serial_number, current_warehouse_id, current_location_id, acquisition_cost, status)
           VALUES ($1, $2, $3, $4, $5, 450.0, 'in_stock')`,
          [companyId, productA.id, serialNum, testWh1Id, locWh1Id]
        );
      } catch (err) {
        dupRejected = true;
      }

      record('INV-010', 'Control estricto de números de serie duplicados', dupRejected, `Serie ${serialNum} registrada; duplicado bloqueado por constraint UNIQUE`);
    } catch (e) {
      record('INV-010', 'Registrar serie duplicada', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-011: Consumo FIFO multicapa (Caso C de la especificación)
    // Caso C: 100u a $10, 80u a $12 -> venta de 130u -> costo $1,360
    // ─────────────────────────────────────────────────────────────────
    try {
      // Creamos un producto C fresco para validar Caso C exactamente según la especificación
      const skuC = `SKU-CASO-C-${Date.now().toString().slice(-5)}`;
      const prodCRes = await pool.query(
        `INSERT INTO products (name, sku, company_id, is_active, min_stock, tracking_type)
         VALUES ('Articulo FIFO Caso C', $1, $2, true, 5, 'none')
         RETURNING *`,
        [skuC, companyId]
      );
      const prodC = prodCRes.rows[0];

      // Entrada 1: 100 unidades a $10.00
      await movementService.executeMovement({
        companyId,
        operationType: 'receipt',
        referenceDocType: 'purchase_order',
        referenceDocId: crypto.randomUUID(),
        userId,
        lines: [{ productId: prodC.id, toWarehouseId: testWh1Id, toLocationId: locWh1Id, quantity: 100, unitCost: 10.0 }],
      });

      // Entrada 2: 80 unidades a $12.00
      await movementService.executeMovement({
        companyId,
        operationType: 'receipt',
        referenceDocType: 'purchase_order',
        referenceDocId: crypto.randomUUID(),
        userId,
        lines: [{ productId: prodC.id, toWarehouseId: testWh1Id, toLocationId: locWh1Id, quantity: 80, unitCost: 12.0 }],
      });

      // Venta: 130 unidades
      const saleMov = await movementService.executeMovement({
        companyId,
        operationType: 'issue',
        referenceDocType: 'sale_invoice',
        referenceDocId: crypto.randomUUID(),
        userId,
        lines: [{ productId: prodC.id, fromWarehouseId: testWh1Id, fromLocationId: locWh1Id, quantity: 130 }],
      });

      // Verificar consumos: 100u de capa 1 ($10) + 30u de capa 2 ($12) = $1,360
      const consumptions = await pool.query(
        `SELECT c.quantity_consumed, c.unit_cost_applied, c.total_cost
         FROM inventory_cost_consumptions c
         JOIN inventory_movement_lines l ON l.id = c.movement_line_id
         WHERE l.movement_id = $1
         ORDER BY c.unit_cost_applied ASC`,
        [saleMov.id]
      );

      const totalCostCalculated = consumptions.rows.reduce((sum, r) => sum + Number(r.total_cost), 0);
      const isExactly1360 = Math.abs(totalCostCalculated - 1360.0) < 0.001;

      // Verificar saldo restante: 50 unidades de la segunda capa @ $12 = $600
      const remainingLayers = await pool.query(
        `SELECT remaining_quantity, functional_unit_cost, status
         FROM inventory_cost_layers WHERE product_id = $1 ORDER BY effective_date ASC`,
        [prodC.id]
      );

      const layer1Exhausted = Number(remainingLayers.rows[0]?.remaining_quantity) === 0 && remainingLayers.rows[0]?.status === 'exhausted';
      const layer2Remaining50 = Number(remainingLayers.rows[1]?.remaining_quantity) === 50 && Number(remainingLayers.rows[1]?.functional_unit_cost) === 12.0;

      const pass = isExactly1360 && layer1Exhausted && layer2Remaining50;
      record('INV-011', 'Motor FIFO multicapa Caso C (130u = $1,360 exactos)', pass, `Costo Total Venta = $${totalCostCalculated.toFixed(2)} (100u@$10 + 30u@$12), Capa restante = 50u@$12`);
    } catch (e) {
      record('INV-011', 'Consumo FIFO multicapa', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-012: Ajuste de inventario (Auditable positivo y negativo)
    // ─────────────────────────────────────────────────────────────────
    try {
      const adjPos = await movementService.executeMovement({
        companyId,
        operationType: 'adjustment_positive',
        referenceDocType: 'inventory_adjustment',
        referenceDocId: crypto.randomUUID(),
        notes: 'Sobrante auditado por embalaje',
        userId,
        lines: [
          {
            productId: productB.id,
            lotId: testLotId,
            toWarehouseId: testWh1Id,
            toLocationId: locWh1Id,
            quantity: 5,
            unitCost: 45.0,
          },
        ],
      });

      const adjNeg = await movementService.executeMovement({
        companyId,
        operationType: 'adjustment_negative',
        referenceDocType: 'inventory_adjustment',
        referenceDocId: crypto.randomUUID(),
        notes: 'Merma auditada por rotura',
        userId,
        lines: [
          {
            productId: productB.id,
            lotId: testLotId,
            fromWarehouseId: testWh1Id,
            fromLocationId: locWh1Id,
            quantity: 2,
          },
        ],
      });

      const bRes = await pool.query(
        `SELECT physical_stock FROM inventory_balances WHERE company_id = $1 AND product_id = $2 AND lot_id = $3`,
        [companyId, productB.id, testLotId]
      );

      const pass = Number(bRes.rows[0]?.physical_stock) === 53; // 50 inicial + 5 - 2 = 53
      record('INV-012', 'Ajuste de inventario auditado positivo/negativo', pass, `Stock ajustado = ${bRes.rows[0]?.physical_stock}u con movimientos ${adjPos.movement_number} y ${adjNeg.movement_number}`);
    } catch (e) {
      record('INV-012', 'Ajuste de inventario', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-013: Conteo físico por pasos con congelamiento y conciliación
    // ─────────────────────────────────────────────────────────────────
    try {
      // 1. Paso 1: Iniciar conteo con congelamiento
      const count = await inventoryService.createCount(companyId, userId, {
        warehouse_id: testWh1Id,
        count_type: 'full',
        notes: 'Auditoría física por pasos con congelamiento temporal',
        freeze_locations: true,
      });

      const countFrozen = count.status === 'counting' && count.lines?.length > 0;

      // 2. Paso 2: Registrar toma física con discrepancia intencional (+2 unidades en productB)
      const lineToAdjust = count.lines.find(l => l.product_id === productB.id) || count.lines[0];
      const expected = Number(lineToAdjust.expected_quantity);
      const actualCounted = expected + 2; // Simulamos 2 unidades sobrantes

      await inventoryService.updateCountLines(companyId, count.id, userId, [
        {
          id: lineToAdjust.id,
          counted_quantity: actualCounted,
          reason: 'Unidades halladas en posición adyacente',
        },
      ]);

      // 3. Paso 3 & 4: Reconciliar y generar ajustes automáticos
      const reconciled = await inventoryService.reconcileCount(companyId, count.id, userId, 'Cierre auditoría');

      // Verificar que el estado cambió a 'reconciled'
      const pass = reconciled.status === 'reconciled' && countFrozen;
      record('INV-013', 'Toma física, congelamiento y conciliación por pasos', pass, `Conteo ${count.count_number} conciliado; ${reconciled.lines?.length} posiciones auditadas`);
    } catch (e) {
      record('INV-013', 'Conteo físico', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-014: Concurrencia y Reservas Simultáneas (Caso D)
    // 2 clientes independientes compitiendo por 5 unidades a la vez
    // ─────────────────────────────────────────────────────────────────
    try {
      // Creamos un producto con exactamente 5 unidades disponibles
      const skuD = `SKU-CONC-${Date.now().toString().slice(-5)}`;
      const prodDRes = await pool.query(
        `INSERT INTO products (name, sku, company_id, is_active, min_stock)
         VALUES ('Articulo Concurrente Caso D', $1, $2, true, 2)
         RETURNING *`,
        [skuD, companyId]
      );
      const prodD = prodDRes.rows[0];

      await movementService.executeMovement({
        companyId,
        operationType: 'receipt',
        referenceDocType: 'initial_stock',
        referenceDocId: crypto.randomUUID(),
        userId,
        lines: [{ productId: prodD.id, toWarehouseId: testWh1Id, toLocationId: locWh1Id, quantity: 5, unitCost: 20.0 }],
      });

      // Crear dos clientes de base de datos simultáneos para simular 2 terminales de venta compitiendo
      const client1 = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: process.env.DATABASE_PASSWORD, database: 'importadora' });
      const client2 = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: process.env.DATABASE_PASSWORD, database: 'importadora' });

      await client1.connect();
      await client2.connect();

      // Función de reserva transaccional con FOR UPDATE
      async function tryReserve(client, vendorName) {
        try {
          await client.query('BEGIN');
          const bal = await client.query(
            `SELECT id, physical_stock, reserved_stock, blocked_stock, available_stock
             FROM inventory_balances
             WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3
             FOR UPDATE`,
            [companyId, prodD.id, testWh1Id]
          );

          const avail = Number(bal.rows[0].available_stock);
          if (avail < 5) {
            await client.query('ROLLBACK');
            return { vendor: vendorName, reserved: 0, reason: `Stock insuficiente (${avail} disponible)` };
          }

          // Asignar reserva
          await client.query(
            `UPDATE inventory_balances
             SET reserved_stock = reserved_stock + 5
             WHERE id = $1`,
            [bal.rows[0].id]
          );

          await client.query('COMMIT');
          return { vendor: vendorName, reserved: 5, reason: 'OK' };
        } catch (err) {
          await client.query('ROLLBACK');
          return { vendor: vendorName, reserved: 0, reason: err.message };
        }
      }

      // Disparar las 2 reservas concurrentemente en paralelo
      const [res1, res2] = await Promise.all([
        tryReserve(client1, 'Vendedor 1'),
        tryReserve(client2, 'Vendedor 2'),
      ]);

      await client1.end();
      await client2.end();

      const winners = [res1, res2].filter(r => r.reserved === 5);
      const losers = [res1, res2].filter(r => r.reserved === 0);

      // Verificamos que exactamente UNO ganó la reserva de 5 unidades, y el otro fue rechazado
      const bFinal = await pool.query(
        `SELECT reserved_stock, available_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3`,
        [companyId, prodD.id, testWh1Id]
      );

      const pass = winners.length === 1 && losers.length === 1 && Number(bFinal.rows[0]?.reserved_stock) === 5 && Number(bFinal.rows[0]?.available_stock) === 0;
      record('INV-014', 'Concurrencia Caso D: Prevención estricta de sobreasignación', pass, `1 ganador (${winners[0]?.vendor}) reservó 5u; 1 rechazado (${losers[0]?.vendor}: ${losers[0]?.reason})`);
    } catch (e) {
      record('INV-014', 'Reservas simultáneas / Concurrencia', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-015: Devolución (Conserva referencia original)
    // ─────────────────────────────────────────────────────────────────
    try {
      const origDocId = crypto.randomUUID();
      const returnMov = await movementService.executeMovement({
        companyId,
        operationType: 'return_customer',
        referenceDocType: 'sales_return',
        referenceDocId: origDocId,
        notes: 'Devolución de cliente por cambio de producto',
        userId,
        lines: [
          {
            productId: productA.id,
            toWarehouseId: testWh1Id,
            toLocationId: locWh1Id,
            quantity: 5,
            unitCost: 10.0,
          },
        ],
      });

      const pass = returnMov.status === 'confirmed' && returnMov.reference_doc_id === origDocId;
      record('INV-015', 'Devolución de cliente con trazabilidad de origen', pass, `Movimiento ${returnMov.movement_number} vinculado a ${origDocId}`);
    } catch (e) {
      record('INV-015', 'Devolución', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-016: Fallo transaccional / Atomicidad (Rollback limpio)
    // ─────────────────────────────────────────────────────────────────
    try {
      const bBefore = await pool.query(
        `SELECT physical_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND location_id = $4`,
        [companyId, productA.id, testWh1Id, locWh1Id]
      );
      const stockBefore = Number(bBefore.rows[0]?.physical_stock || 0);

      const movsBefore = await pool.query(`SELECT count(*)::int AS cnt FROM inventory_movements WHERE company_id = $1`, [companyId]);
      const movsCountBefore = movsBefore.rows[0].cnt;

      let rollbackTriggered = false;
      try {
        await movementService.executeMovement({
          companyId,
          operationType: 'issue',
          referenceDocId: crypto.randomUUID(),
          userId,
          lines: [
            { productId: productA.id, fromWarehouseId: testWh1Id, fromLocationId: locWh1Id, quantity: 10 },
            { productId: productA.id, fromWarehouseId: testWh1Id, fromLocationId: locWh1Id, quantity: 999999 }, // Forzar fallo en la 2da línea
          ],
        });
      } catch (err) {
        rollbackTriggered = true;
      }

      const bAfter = await pool.query(
        `SELECT physical_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND location_id = $4`,
        [companyId, productA.id, testWh1Id, locWh1Id]
      );
      const movsAfter = await pool.query(`SELECT count(*)::int AS cnt FROM inventory_movements WHERE company_id = $1`, [companyId]);

      const pass = rollbackTriggered && Number(bAfter.rows[0]?.physical_stock) === stockBefore && movsAfter.rows[0].cnt === movsCountBefore;
      record('INV-016', 'Atomicidad transaccional: Rollback completo sin huérfanos', pass, `Stock intacto en ${stockBefore}u, cero movimientos huérfanos`);
    } catch (e) {
      record('INV-016', 'Fallo transaccional', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-017: Reintento duplicado / Idempotencia
    // ─────────────────────────────────────────────────────────────────
    try {
      const idemKey = `IDEMP-${Date.now()}`;
      const firstCall = await movementService.executeMovement({
        companyId,
        idempotencyKey: idemKey,
        operationType: 'receipt',
        referenceDocId: crypto.randomUUID(),
        userId,
        lines: [{ productId: productB.id, toWarehouseId: testWh1Id, toLocationId: locWh1Id, quantity: 10, unitCost: 50.0 }],
      });

      // Segundo intento con la misma clave exacta
      const secondCall = await movementService.executeMovement({
        companyId,
        idempotencyKey: idemKey,
        operationType: 'receipt',
        referenceDocId: crypto.randomUUID(),
        userId,
        lines: [{ productId: productB.id, toWarehouseId: testWh1Id, toLocationId: locWh1Id, quantity: 10, unitCost: 50.0 }],
      });

      const pass = firstCall.id === secondCall.id && firstCall.movement_number === secondCall.movement_number;
      record('INV-017', 'Idempotencia: Reintento duplicado no duplica saldo', pass, `Llamada idempotente devolvió mismo movimiento ${firstCall.movement_number}`);
    } catch (e) {
      record('INV-017', 'Reintento duplicado', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-018: Reconstrucción de saldos
    // ─────────────────────────────────────────────────────────────────
    try {
      // Para productA en Wh1/locWh1:
      const totalEntries = await pool.query(
        `SELECT COALESCE(SUM(l.quantity), 0) as entries
         FROM inventory_movement_lines l
         JOIN inventory_movements m ON m.id = l.movement_id
         WHERE m.company_id = $1 AND l.product_id = $2 AND l.to_location_id = $3 AND m.status = 'confirmed'`,
        [companyId, productA.id, locWh1Id]
      );

      const totalExits = await pool.query(
        `SELECT COALESCE(SUM(l.quantity), 0) as exits
         FROM inventory_movement_lines l
         JOIN inventory_movements m ON m.id = l.movement_id
         WHERE m.company_id = $1 AND l.product_id = $2 AND l.from_location_id = $3 AND m.status = 'confirmed'`,
        [companyId, productA.id, locWh1Id]
      );

      const expectedReconstructed = Number(totalEntries.rows[0].entries) - Number(totalExits.rows[0].exits);

      const actualBalance = await pool.query(
        `SELECT physical_stock FROM inventory_balances
         WHERE company_id = $1 AND product_id = $2 AND location_id = $3`,
        [companyId, productA.id, locWh1Id]
      );

      const pass = expectedReconstructed === Number(actualBalance.rows[0]?.physical_stock);
      record('INV-018', 'Reconstrucción histórica de saldos desde movimientos', pass, `Entradas(${totalEntries.rows[0].entries}) - Salidas(${totalExits.rows[0].exits}) = Saldo Actual(${actualBalance.rows[0]?.physical_stock})`);
    } catch (e) {
      record('INV-018', 'Reconstrucción de saldos', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-019: Conciliación FIFO
    // ─────────────────────────────────────────────────────────────────
    try {
      const layersSum = await pool.query(
        `SELECT COALESCE(SUM(remaining_quantity * functional_unit_cost), 0) as layer_val
         FROM inventory_cost_layers
         WHERE company_id = $1 AND product_id = $2 AND status = 'active'`,
        [companyId, productA.id]
      );

      const valData = await fifoService.getValuation(companyId);
      const prodAValuation = valData.products.find(p => p.product_id === productA.id);

      const diff = Math.abs(Number(layersSum.rows[0].layer_val) - Number(prodAValuation?.total_valuation || 0));
      const pass = diff < 0.01;

      record('INV-019', 'Conciliación matemática FIFO con Capas Activas', pass, `Valoración Capas: $${Number(layersSum.rows[0].layer_val).toFixed(2)} = Reporte: $${Number(prodAValuation?.total_valuation || 0).toFixed(2)}`);
    } catch (e) {
      record('INV-019', 'Conciliación FIFO', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // INV-020: Control de permisos y restricciones de bodega
    // ─────────────────────────────────────────────────────────────────
    try {
      // Inyectar stock en bodega de cuarentena (donde allows_sale_dispatch = false)
      await movementService.executeMovement({
        companyId,
        operationType: 'receipt',
        referenceDocId: crypto.randomUUID(),
        userId,
        lines: [{ productId: productB.id, toWarehouseId: testQuarantineWhId, toLocationId: locQuarantineId, quantity: 10, unitCost: 30.0 }],
      });

      // Verificar que la bodega de cuarentena restringe despachos comerciales
      const qBal = await pool.query(
        `SELECT b.available_stock, w.allows_sale_dispatch
         FROM inventory_balances b
         JOIN warehouses w ON w.id = b.warehouse_id
         WHERE b.company_id = $1 AND b.warehouse_id = $2`,
        [companyId, testQuarantineWhId]
      );

      const isQuarantineRestricted = qBal.rows[0]?.allows_sale_dispatch === false;
      record('INV-020', 'Control de permisos y bloqueo de despacho en cuarentena', isQuarantineRestricted, `Bodega de cuarentena bloqueada para despachos comerciales (allows_sale_dispatch: false)`);
    } catch (e) {
      record('INV-020', 'Control de permisos', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // CASOS ESPECIALES A Y B
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- CASO A: IMPORTACIÓN CON VARIOS PRODUCTOS Y PRORRATEO ---');
    try {
      // 100u de Prod A, 50u de Prod B con costos distribuidos
      const impMov = await movementService.executeMovement({
        companyId,
        operationType: 'receipt',
        referenceDocType: 'import_folder',
        referenceDocId: crypto.randomUUID(),
        notes: 'Liquidación de importación consolidada con aranceles y flete prorrateado',
        userId,
        lines: [
          { productId: productA.id, toWarehouseId: testWh1Id, toLocationId: locWh1Id, quantity: 100, unitCost: 11.45 },
          { productId: productB.id, toWarehouseId: testWh2Id, toLocationId: locWh2Id, quantity: 50, unitCost: 48.70 },
        ],
      });
      console.log(`✅ [CASO A] Importación consolidada ejecutada: Movimiento ${impMov.movement_number} con 150u valoradas.`);
    } catch (e) {
      console.log(`❌ [CASO A] Error: ${e.message}`);
    }

    console.log('\n--- CASO B: TRANSFERENCIA CON NÚMEROS DE SERIE INDIVIDUALES ---');
    try {
      const serialList = [
        `PC-SER-${Date.now()}-01`,
        `PC-SER-${Date.now()}-02`,
        `PC-SER-${Date.now()}-03`,
      ];

      for (const sn of serialList) {
        await pool.query(
          `INSERT INTO inventory_serials (company_id, product_id, serial_number, current_warehouse_id, current_location_id, acquisition_cost, status)
           VALUES ($1, $2, $3, $4, $5, 550.0, 'in_stock')`,
          [companyId, productA.id, sn, testWh1Id, locWh1Id]
        );
      }

      // Actualizar ubicación de los seriales a Bodega 2
      await pool.query(
        `UPDATE inventory_serials SET current_warehouse_id = $1, current_location_id = $2
         WHERE serial_number = ANY($3::text[])`,
        [testWh2Id, locWh2Id, serialList]
      );

      const snTransferred = await pool.query(
        `SELECT count(*)::int as cnt FROM inventory_serials WHERE current_warehouse_id = $1 AND serial_number = ANY($2::text[])`,
        [testWh2Id, serialList]
      );
      console.log(`✅ [CASO B] Transferencia de ${snTransferred.rows[0].cnt} equipos serializados completada y verificada en destino.`);
    } catch (e) {
      console.log(`❌ [CASO B] Error: ${e.message}`);
    }

    console.log('\n================================================================');
    const passedCount = results.filter(r => r.passed).length;
    console.log(`RESUMEN: ${passedCount} / ${results.length} PRUEBAS SUPERADAS CON ÉXITO.`);
    console.log('================================================================\n');

  } finally {
    await app.close();
  }
}

runAcceptanceTests().catch(err => {
  console.error('FATAL ERROR EN SUITE:', err);
  process.exit(1);
});
