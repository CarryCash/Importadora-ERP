import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { claimLogisticsRequest, completeLogisticsRequest, decrementInventory } from '../common/logistics-idempotency';

@Injectable()
export class ReceivingRepository {
  constructor(private readonly db: DatabaseService) {}

  async listPurchaseOrders(companyId: string) {
    const result = await this.db.query(
      `SELECT po.*, s.name AS supplier_name,
         COALESCE(json_agg(json_build_object('id', poi.id, 'product_id', poi.product_id, 'product_name', p.name,
           'sku', p.sku, 'ordered_quantity', poi.ordered_quantity, 'received_quantity', poi.received_quantity,
           'unit_cost', poi.unit_cost,'input_quantity',poi.input_quantity,'product_unit_id',poi.product_unit_id,
           'unit_code_snapshot',poi.unit_code_snapshot,'conversion_factor_snapshot',poi.conversion_factor_snapshot,
           'input_unit_cost',poi.input_unit_cost,'product_supplier_id',poi.product_supplier_id,
           'supplier_product_code_snapshot',poi.supplier_product_code_snapshot,'supplier_currency_snapshot',poi.supplier_currency_snapshot,
           'supplier_quoted_cost_snapshot',poi.supplier_quoted_cost_snapshot)) FILTER (WHERE poi.id IS NOT NULL), '[]'::json) AS items
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       LEFT JOIN products p ON p.id = poi.product_id
       WHERE po.company_id = $1 GROUP BY po.id, s.name ORDER BY po.created_at DESC`, [companyId]);
    return result.rows;
  }

  async createPurchaseOrder(companyId: string, userId: string, data: any) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const supplier=await client.query('SELECT id FROM suppliers WHERE id=$1 AND company_id=$2 FOR UPDATE',[data.supplier_id,companyId]);
      if(!supplier.rowCount)throw new NotFoundException('Proveedor no encontrado para esta empresa.');
      const productIds=[...new Set((data.items||[]).map((item:any)=>item.product_id))];
      const products=await client.query('SELECT id FROM products WHERE company_id=$1 AND id=ANY($2::uuid[])',[companyId,productIds]);
      if(products.rowCount!==productIds.length)throw new NotFoundException('Uno o más productos no pertenecen a esta empresa.');
      const sequence = await client.query("SELECT nextval('purchase_order_number_seq') AS n");
      const orderNumber = `OC-${new Date().getFullYear()}-${String(sequence.rows[0].n).padStart(6, '0')}`;
      const header = await client.query(
        `INSERT INTO purchase_orders (company_id, order_number, supplier_id, expected_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [companyId, orderNumber, data.supplier_id, data.expected_date || null, data.notes || null, userId],
      );
      for (const item of data.items) {
        const inputQuantity=Number(item.quantity);
        const inputUnitCost=Number(item.unit_cost||0);
        if(!Number.isFinite(inputQuantity)||inputQuantity<=0||!Number.isFinite(inputUnitCost)||inputUnitCost<0)throw new ConflictException('La cantidad y el costo de compra deben ser válidos.');
        let baseQuantity=inputQuantity,conversionFactor=1,unitId:string|null=null,unitCode='unidad',precisionScale=0;
        if(item.unit_id){
          const unit=await client.query('SELECT id,unit_code,is_base,precision_scale FROM product_units WHERE id=$1 AND company_id=$2 AND product_id=$3 AND is_active',[item.unit_id,companyId,item.product_id]);
          if(!unit.rowCount)throw new NotFoundException('La unidad elegida no pertenece al producto o está inactiva.');
          unitId=unit.rows[0].id;unitCode=unit.rows[0].unit_code;precisionScale=Number(unit.rows[0].precision_scale||0);
          if(!unit.rows[0].is_base){const base=await client.query('SELECT id FROM product_units WHERE company_id=$1 AND product_id=$2 AND is_base AND is_active',[companyId,item.product_id]);if(!base.rowCount)throw new ConflictException('Configura una unidad base antes de crear conversiones de compra.');
            const conversion=await client.query(`SELECT factor FROM product_unit_conversions WHERE company_id=$1 AND product_id=$2 AND from_unit_id=$3 AND to_unit_id=$4 AND status='approved' AND valid_from<=CURRENT_DATE AND (valid_until IS NULL OR valid_until>=CURRENT_DATE) ORDER BY valid_from DESC LIMIT 1`,[companyId,item.product_id,unitId,base.rows[0].id]);
            if(!conversion.rowCount)throw new ConflictException(`No existe conversión aprobada vigente de ${unitCode} a la unidad base.`);conversionFactor=Number(conversion.rows[0].factor);
          }
        }
        if(Math.abs(inputQuantity*Math.pow(10,precisionScale)-Math.round(inputQuantity*Math.pow(10,precisionScale)))>1e-7)throw new ConflictException(`La unidad ${unitCode} admite hasta ${precisionScale} decimales.`);
        baseQuantity=inputQuantity*conversionFactor;
        if(!Number.isSafeInteger(baseQuantity))throw new ConflictException(`La cantidad de compra debe equivaler a unidades base enteras (${inputQuantity} ${unitCode} = ${baseQuantity}).`);
        const sourcing=await client.query(`SELECT id,supplier_product_code,currency,quoted_unit_cost FROM product_suppliers WHERE company_id=$1 AND product_id=$2 AND supplier_id=$3 AND valid_from<=CURRENT_DATE AND (valid_until IS NULL OR valid_until>=CURRENT_DATE) ORDER BY is_preferred DESC,valid_from DESC LIMIT 1`,[companyId,item.product_id,data.supplier_id]);
        await client.query(
          `INSERT INTO purchase_order_items (purchase_order_id, product_id, ordered_quantity, unit_cost,input_quantity,product_unit_id,unit_code_snapshot,conversion_factor_snapshot,input_unit_cost,product_supplier_id,supplier_product_code_snapshot,supplier_currency_snapshot,supplier_quoted_cost_snapshot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [header.rows[0].id,item.product_id,baseQuantity,inputUnitCost/conversionFactor,inputQuantity,unitId,unitCode,conversionFactor,inputUnitCost,sourcing.rows[0]?.id||null,sourcing.rows[0]?.supplier_product_code||null,sourcing.rows[0]?.currency||null,sourcing.rows[0]?.quoted_unit_cost??null],
        );
      }
      await client.query('COMMIT');
      return header.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async listSources(companyId: string, sourceType: string) {
    if (sourceType === 'purchase_order') {
      const result = await this.db.query(
        `SELECT po.id, po.order_number AS label, po.expected_date, s.name AS supplier_name
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
         WHERE po.company_id = $1 AND po.status IN ('approved','partial')
           AND EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.purchase_order_id = po.id AND i.received_quantity < i.ordered_quantity)
         ORDER BY po.expected_date NULLS LAST, po.created_at`, [companyId]);
      return result.rows;
    }
    if (sourceType === 'import') {
      const result = await this.db.query(
        `SELECT i.id, COALESCE(i.bl_number, i.tracking_number, 'Importación') AS label,
          i.estimated_arrival AS expected_date, s.name AS supplier_name
         FROM imports i JOIN suppliers s ON s.id = i.supplier_id
         WHERE i.company_id=$1 AND i.status NOT IN ('CANCELED','WAREHOUSE') AND EXISTS
           (SELECT 1 FROM import_items ii WHERE ii.import_id = i.id AND ii.received_quantity < ii.expected_quantity)
         ORDER BY i.estimated_arrival NULLS LAST, i.created_at`, [companyId]);
      return result.rows;
    }
    if (sourceType === 'transfer') {
      const result = await this.db.query(
        `SELECT wt.id, wt.transfer_number AS label, wt.target_warehouse_id, wt.created_at AS expected_date,
          o.name AS origin_name, t.name AS target_name
         FROM warehouse_transfers wt JOIN warehouses o ON o.id=wt.origin_warehouse_id
         JOIN warehouses t ON t.id=wt.target_warehouse_id
         WHERE wt.company_id=$1 AND wt.status IN ('in_transit','partial')
           AND EXISTS (SELECT 1 FROM warehouse_transfer_items i WHERE i.transfer_id=wt.id AND i.received_quantity < i.quantity)
         ORDER BY wt.created_at`, [companyId]);
      return result.rows;
    }
    return [];
  }

  async createTransfer(companyId: string, userId: string, data: any) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const origin = await client.query('SELECT id FROM warehouses WHERE id=$1 AND company_id=$2 FOR UPDATE', [data.origin_warehouse_id, companyId]);
      const target = await client.query('SELECT id FROM warehouses WHERE id=$1 AND company_id=$2', [data.target_warehouse_id, companyId]);
      const transitRes = await client.query("SELECT id FROM warehouses WHERE code='WH-TRANSIT' AND company_id=$1", [companyId]);
      if (!origin.rowCount || !target.rowCount || !transitRes.rowCount) throw new NotFoundException('Bodega de origen, destino o tránsito no encontrada.');
      const sequence = await client.query("SELECT nextval('warehouse_transfer_number_seq') AS n");
      const number = `TR-${new Date().getFullYear()}-${String(sequence.rows[0].n).padStart(6, '0')}`;
      const transfer = await client.query(
        `INSERT INTO warehouse_transfers(company_id,transfer_number,origin_warehouse_id,target_warehouse_id,notes,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [companyId, number, data.origin_warehouse_id, data.target_warehouse_id, data.notes || null, userId],
      );
      for (const item of data.items) {
        const source = await client.query(
          `SELECT i.*, b.product_id, b.unit_cost FROM inventory i JOIN product_batches b ON b.id=i.batch_id
           JOIN products p ON p.id=b.product_id WHERE i.id=$1 AND i.warehouse_id=$2 AND p.company_id=$3 FOR UPDATE`,
          [item.inventory_id, data.origin_warehouse_id, companyId],
        );
        if (!source.rowCount || source.rows[0].stock_status!=='available' || Number(source.rows[0].quantity) < Number(item.quantity)) throw new ConflictException('Existencia disponible insuficiente para despachar la transferencia.');
        const stock = source.rows[0];
        await decrementInventory(client,stock.id,Number(item.quantity));
        const transitLocation=await client.query("SELECT id,code FROM storage_locations WHERE warehouse_id=$1 AND is_default=true AND status='active' LIMIT 1",[transitRes.rows[0].id]);
        if(!transitLocation.rowCount) throw new NotFoundException('La bodega de tránsito no tiene una ubicación predeterminada.');
        const inTransit = await client.query(
          `INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location) VALUES($1,$2,$3,'available',$4,$5)
           ON CONFLICT (batch_id,warehouse_id,storage_location_id,stock_status) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,
          [stock.batch_id, transitRes.rows[0].id, transitLocation.rows[0].id,item.quantity, transitLocation.rows[0].code],
        );
        await client.query(
          `INSERT INTO warehouse_transfer_items(transfer_id,product_id,batch_id,quantity,unit_cost) VALUES($1,$2,$3,$4,$5)`,
          [transfer.rows[0].id, stock.product_id, stock.batch_id, item.quantity, stock.unit_cost || 0],
        );
        for (const [inventoryId, delta, note] of [[stock.id, -Number(item.quantity), `Salida transferencia ${number}`], [inTransit.rows[0].id, Number(item.quantity), `Ingreso a tránsito ${number}`]] as [string, number, string][]) {
          await client.query(`INSERT INTO stock_movements(inventory_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by)
            VALUES($1,$2,'adjustment',$3,$4,$5,$6)`, [inventoryId, stock.batch_id, delta, transfer.rows[0].id, note, userId]);
        }
      }
      await client.query('COMMIT');
      return transfer.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async createReceipt(companyId: string, userId: string, data: any, idempotencyKey?:string) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const cached=await claimLogisticsRequest(client,companyId,'receiving.create',idempotencyKey,data);
      if(cached){await client.query('COMMIT');return this.getReceipt(companyId,cached.id);}
      const seq = await client.query("SELECT nextval('goods_receipt_number_seq') AS n");
      const number = `REC-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(6, '0')}`;
      let supplierId = data.supplier_id || null;
      let originWarehouseId = data.origin_warehouse_id || null;
      let targetWarehouseId = data.target_warehouse_id;
      let expectedItems: any[] = [];
      if (data.source_type === 'purchase_order') {
        const order = await client.query('SELECT supplier_id FROM purchase_orders WHERE id=$1 AND company_id=$2 AND status IN (\'approved\',\'partial\') FOR UPDATE', [data.source_id, companyId]);
        if (!order.rowCount) throw new NotFoundException('Orden de compra no disponible para recepción.');
        supplierId = order.rows[0].supplier_id;
        const items = await client.query(`SELECT i.id AS source_line_id,i.product_id,p.name AS product_name,p.sku,
          i.ordered_quantity-i.received_quantity AS expected_quantity,i.unit_cost
          FROM purchase_order_items i JOIN products p ON p.id=i.product_id WHERE i.purchase_order_id=$1 AND p.company_id=$2 AND i.received_quantity<i.ordered_quantity`, [data.source_id,companyId]);
        expectedItems = items.rows;
      } else if (data.source_type === 'import') {
        const shipment = await client.query('SELECT supplier_id FROM imports WHERE id=$1 AND company_id=$2 AND status NOT IN (\'CANCELED\',\'WAREHOUSE\') FOR UPDATE', [data.source_id,companyId]);
        if (!shipment.rowCount) throw new NotFoundException('Importación no disponible para recepción.');
        supplierId = shipment.rows[0].supplier_id;
        const items = await client.query(`SELECT i.id AS source_line_id,i.product_id,p.name AS product_name,p.sku,
          i.expected_quantity-i.received_quantity AS expected_quantity,i.unit_cost,i.batch_number,i.expiration_date,i.suggested_location AS temporary_location
          FROM import_items i JOIN products p ON p.id=i.product_id JOIN imports im ON im.id=i.import_id WHERE i.import_id=$1 AND im.company_id=$2 AND p.company_id=$2 AND i.received_quantity<i.expected_quantity`, [data.source_id,companyId]);
        expectedItems = items.rows;
      } else if (data.source_type === 'transfer') {
        const transfer = await client.query(`SELECT origin_warehouse_id,target_warehouse_id FROM warehouse_transfers
          WHERE id=$1 AND company_id=$2 AND status IN ('in_transit','partial') FOR UPDATE`, [data.source_id, companyId]);
        if (!transfer.rowCount) throw new NotFoundException('Transferencia no disponible para recepción.');
        originWarehouseId = transfer.rows[0].origin_warehouse_id;
        targetWarehouseId = data.target_warehouse_id || transfer.rows[0].target_warehouse_id;
        if (targetWarehouseId !== transfer.rows[0].target_warehouse_id) throw new ConflictException('La bodega destino no coincide con la transferencia.');
        const items = await client.query(`SELECT i.id AS source_line_id,i.product_id,p.name AS product_name,p.sku,
          i.batch_id,i.quantity-i.received_quantity AS expected_quantity,i.unit_cost,b.batch_number,b.expiration_date
          FROM warehouse_transfer_items i JOIN products p ON p.id=i.product_id JOIN product_batches b ON b.id=i.batch_id
          WHERE i.transfer_id=$1 AND p.company_id=$2 AND i.received_quantity<i.quantity`, [data.source_id,companyId]);
        expectedItems = items.rows;
      } else {
        expectedItems = data.items || [];
        const productIds=[...new Set(expectedItems.map((item:any)=>item.product_id))];
        const products=await client.query('SELECT id FROM products WHERE company_id=$1 AND id=ANY($2::uuid[])',[companyId,productIds]);
        if(products.rowCount!==productIds.length)throw new NotFoundException('Uno o más productos no pertenecen a esta empresa.');
      }
      if (!expectedItems.length) throw new ConflictException('La fuente no tiene cantidades pendientes de recibir.');
      const wh = await client.query('SELECT id FROM warehouses WHERE id=$1 AND company_id=$2', [targetWarehouseId, companyId]);
      if (!wh.rowCount) throw new NotFoundException('Bodega de destino no encontrada.');
      if(supplierId){const supplier=await client.query('SELECT id FROM suppliers WHERE id=$1 AND company_id=$2',[supplierId,companyId]);if(!supplier.rowCount)throw new NotFoundException('Proveedor no encontrado para esta empresa.');}
      if(originWarehouseId){const origin=await client.query('SELECT id FROM warehouses WHERE id=$1 AND company_id=$2',[originWarehouseId,companyId]);if(!origin.rowCount)throw new NotFoundException('Bodega de origen no encontrada para esta empresa.');}
      const header = await client.query(`INSERT INTO goods_receipts(company_id,receipt_number,source_type,source_id,supplier_id,
        origin_warehouse_id,target_warehouse_id,carrier_name,vehicle_plate,arrived_at,unloaded_at,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [companyId,number,data.source_type,data.source_id||null,supplierId,originWarehouseId,targetWarehouseId,
          data.carrier_name||null,data.vehicle_plate||null,data.arrived_at||null,data.unloaded_at||null,data.notes||null,userId]);
      for (const item of expectedItems) {
        await client.query(`INSERT INTO goods_receipt_items(receipt_id,source_line_id,product_id,expected_quantity,unit_cost,
          batch_number,expiration_date,temporary_location) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [header.rows[0].id,item.source_line_id||null,item.product_id,item.expected_quantity||item.quantity||0,item.unit_cost||0,
            item.batch_number||null,item.expiration_date||null,item.temporary_location||null]);
      }
      await completeLogisticsRequest(client,companyId,'receiving.create',idempotencyKey,data,{id:header.rows[0].id});
      await client.query('COMMIT');
      return this.getReceipt(companyId, header.rows[0].id);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async listReceipts(companyId: string) {
    const result = await this.db.query(`SELECT r.*,s.name AS supplier_name,w.name AS target_warehouse_name,
      (SELECT COUNT(*) FROM goods_receipt_items i WHERE i.receipt_id=r.id) AS line_count
      FROM goods_receipts r LEFT JOIN suppliers s ON s.id=r.supplier_id JOIN warehouses w ON w.id=r.target_warehouse_id
      WHERE r.company_id=$1 ORDER BY r.created_at DESC LIMIT 100`, [companyId]);
    return result.rows;
  }

  async getReceipt(companyId: string, id: string) {
    const header = await this.db.query(`SELECT r.*,s.name AS supplier_name,w.name AS target_warehouse_name,
      o.name AS origin_warehouse_name FROM goods_receipts r LEFT JOIN suppliers s ON s.id=r.supplier_id
      JOIN warehouses w ON w.id=r.target_warehouse_id LEFT JOIN warehouses o ON o.id=r.origin_warehouse_id
      WHERE r.id=$1 AND r.company_id=$2`, [id, companyId]);
    if (!header.rowCount) throw new NotFoundException('Recepción no encontrada.');
    const [items, evidence] = await Promise.all([
      this.db.query(`SELECT i.*,p.name AS product_name,p.sku FROM goods_receipt_items i JOIN products p ON p.id=i.product_id WHERE i.receipt_id=$1 ORDER BY p.name`, [id]),
      this.db.query(`SELECT id,file_name,mime_type,data_url,description,created_at FROM goods_receipt_evidence WHERE receipt_id=$1 ORDER BY created_at DESC`, [id]),
    ]);
    return { ...header.rows[0], items: items.rows, evidence: evidence.rows };
  }

  async updateReceiptDetails(companyId: string, id: string, data: any) {
    const client=await this.db.getPool().connect();
    try{await client.query('BEGIN');const lock=await client.query("SELECT id FROM goods_receipts WHERE id=$1 AND company_id=$2 AND status IN ('in_progress','inspection','ready') FOR UPDATE",[id,companyId]);if(!lock.rowCount)throw new NotFoundException('Recepción no encontrada, cerrada o cancelada.');
    await client.query(`UPDATE goods_receipts SET carrier_name=$1,vehicle_plate=$2,arrived_at=$3,unloaded_at=$4,
      notes=$5,status=CASE WHEN $6 THEN 'inspection' ELSE status END,updated_at=CURRENT_TIMESTAMP
      WHERE id=$7 AND company_id=$8`, [data.carrier_name||null,data.vehicle_plate||null,data.arrived_at||null,
      data.unloaded_at||null,data.notes||null,data.status==='inspection',id,companyId]);await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    return this.getReceipt(companyId,id);
  }

  async updateReceiptItem(companyId: string, receiptId: string, itemId: string, data: any) {
    const client=await this.db.getPool().connect();
    try{await client.query('BEGIN');const lock=await client.query("SELECT r.id FROM goods_receipts r WHERE r.id=$1 AND r.company_id=$2 AND r.status IN ('in_progress','inspection','ready') FOR UPDATE",[receiptId,companyId]);if(!lock.rowCount)throw new NotFoundException('Recepción no encontrada, cerrada o cancelada.');
    const updated=await client.query(`UPDATE goods_receipt_items i SET received_quantity=$1,damaged_quantity=$2,
      missing_quantity=GREATEST(i.expected_quantity-$1,0),surplus_quantity=GREATEST($1-i.expected_quantity,0),
      barcode=$3,batch_number=$4,serial_numbers=$5::jsonb,expiration_date=$6,quality_status=$7,
      quality_notes=$8,temporary_location=$9,quarantine=$10
      FROM goods_receipts r WHERE i.receipt_id=r.id AND i.id=$11 AND r.id=$12 AND r.company_id=$13`,
      [data.received_quantity,data.damaged_quantity||0,data.barcode||null,data.batch_number||null,
       JSON.stringify(data.serial_numbers||[]),data.expiration_date||null,data.quality_status||'pending',
       data.quality_notes||null,data.temporary_location||null,Boolean(data.quarantine),itemId,receiptId,companyId]);if(!updated.rowCount)throw new NotFoundException('Línea de recepción no encontrada.');await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    return this.getReceipt(companyId,receiptId);
  }

  async addEvidence(companyId: string, receiptId: string, userId: string, data: any) {
    const client=await this.db.getPool().connect();let evidence:any;
    try{await client.query('BEGIN');const open=await client.query("SELECT id FROM goods_receipts WHERE id=$1 AND company_id=$2 AND status IN ('in_progress','inspection','ready') FOR UPDATE",[receiptId,companyId]);if(!open.rowCount)throw new NotFoundException('Recepción no encontrada, cerrada o cancelada.');
    const result = await client.query(`INSERT INTO goods_receipt_evidence(receipt_id,file_name,mime_type,data_url,description,uploaded_by)
      SELECT r.id,$1,$2,$3,$4,$5 FROM goods_receipts r WHERE r.id=$6 AND r.company_id=$7 RETURNING id,file_name,mime_type,description,created_at`,
      [data.file_name,data.mime_type,data.data_url,data.description||null,userId,receiptId,companyId]);
    if (!result.rowCount) throw new NotFoundException('Recepción no encontrada.');
    evidence=result.rows[0];await client.query('COMMIT');return evidence;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async closeReceipt(companyId: string, receiptId: string, userId: string,idempotencyKey?:string) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const payload={receipt_id:receiptId};const cached=await claimLogisticsRequest(client,companyId,'receiving.close',idempotencyKey,payload);
      if(cached){await client.query('COMMIT');return this.getReceipt(companyId,cached.id);}
      const receiptRes = await client.query('SELECT * FROM goods_receipts WHERE id=$1 AND company_id=$2 FOR UPDATE', [receiptId,companyId]);
      if (!receiptRes.rowCount) throw new NotFoundException('Recepción no encontrada.');
      const receipt = receiptRes.rows[0];
      if (receipt.status === 'closed') { await completeLogisticsRequest(client,companyId,'receiving.close',idempotencyKey,payload,{id:receiptId});await client.query('COMMIT'); return this.getReceipt(companyId,receiptId); }
      if (receipt.status === 'cancelled') throw new ConflictException('No se puede cerrar una recepción cancelada.');
      const itemsRes = await client.query('SELECT * FROM goods_receipt_items WHERE receipt_id=$1 FOR UPDATE', [receiptId]);
      if (!itemsRes.rowCount || itemsRes.rows.some((item) => item.quality_status === 'pending')) throw new ConflictException('Completa la inspección de calidad de todas las líneas antes de cerrar.');
      const quarantineRes = await client.query("SELECT id FROM warehouses WHERE code='WH-QUARANTINE' AND company_id=$1", [companyId]);
      const transitRes = receipt.source_type === 'transfer' ? await client.query("SELECT id FROM warehouses WHERE code='WH-TRANSIT' AND company_id=$1", [companyId]) : null;
      for (const item of itemsRes.rows) {
        const received = Number(item.received_quantity);
        const damaged = Number(item.damaged_quantity);
        if (damaged > received) throw new ConflictException('La cantidad dañada no puede superar la cantidad recibida.');
        const accepted = received - damaged;
        const held = item.quarantine || item.quality_status !== 'approved' || damaged > 0;
        const targetWarehouseId = held ? quarantineRes.rows[0]?.id : receipt.target_warehouse_id;
        if (received > 0 && !targetWarehouseId) throw new NotFoundException('No existe una bodega de cuarentena configurada.');
        let batchId = item.batch_id || null;
        if (receipt.source_type === 'transfer') {
          const transferLine = await client.query('SELECT batch_id,quantity,received_quantity FROM warehouse_transfer_items WHERE id=$1 AND transfer_id=$2 FOR UPDATE', [item.source_line_id,receipt.source_id]);
          if (!transferLine.rowCount) throw new NotFoundException('Línea de transferencia no encontrada.');
          batchId = transferLine.rows[0].batch_id;
          await client.query('UPDATE goods_receipt_items SET batch_id=$1 WHERE id=$2',[batchId,item.id]);
          if (received > Number(transferLine.rows[0].quantity) - Number(transferLine.rows[0].received_quantity)) throw new ConflictException('La cantidad recibida supera lo pendiente en tránsito.');
          await client.query('UPDATE warehouse_transfer_items SET received_quantity=received_quantity+$1 WHERE id=$2',[received,item.source_line_id]);
          const transitInventory = await client.query("SELECT * FROM inventory WHERE batch_id=$1 AND warehouse_id=$2 AND stock_status='available' ORDER BY quantity DESC LIMIT 1 FOR UPDATE",[batchId,transitRes?.rows[0]?.id]);
          const movedQuantity = held ? received : accepted;
          if (!transitInventory.rowCount || Number(transitInventory.rows[0].quantity) < movedQuantity) throw new ConflictException('No hay existencias suficientes en tránsito para esta recepción.');
          if (movedQuantity > 0) {
            await decrementInventory(client,transitInventory.rows[0].id,movedQuantity);
            const targetLocation=await client.query(`SELECT id,code FROM storage_locations WHERE warehouse_id=$1 AND company_id=$2 AND status='active'
              ORDER BY CASE WHEN code=$3 THEN 0 WHEN is_default THEN 1 ELSE 2 END LIMIT 1`,[targetWarehouseId,companyId,item.temporary_location||'']);
            if(!targetLocation.rowCount) throw new NotFoundException('No hay una ubicación activa para recibir la mercancía.');
            const targetStatus=held?'quarantine':'available';
            await this.validateStorageCapacity(client,companyId,targetLocation.rows[0].id,item.product_id,movedQuantity);
            const target = await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location) VALUES($1,$2,$3,$4,$5,$6)
              ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,bin_location=EXCLUDED.bin_location,last_updated=CURRENT_TIMESTAMP RETURNING id`,
              [batchId,targetWarehouseId,targetLocation.rows[0].id,targetStatus,movedQuantity,item.temporary_location||targetLocation.rows[0].code]);
            for (const [inventoryId,delta,note] of [[transitInventory.rows[0].id,-movedQuantity,`Salida transferencia recibida ${receipt.receipt_number}`],[target.rows[0].id,movedQuantity,`${held?'Ingreso a cuarentena':'Ingreso transferencia'} ${receipt.receipt_number}`]] as [string,number,string][]) {
              await client.query(`INSERT INTO stock_movements(inventory_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by) VALUES($1,$2,'adjustment',$3,$4,$5,$6)`,[inventoryId,batchId,delta,receiptId,note,userId]);
            }
          }
          await client.query(`UPDATE warehouse_transfers SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM warehouse_transfer_items WHERE transfer_id=$1 AND received_quantity<quantity) THEN 'received' ELSE 'partial' END WHERE id=$1`,[receipt.source_id]);
        } else {
          if (received > 0) {
            const batch = await client.query(`INSERT INTO product_batches(import_id,product_id,batch_number,expiration_date,unit_cost)
              VALUES($1,$2,$3,$4,$5) RETURNING id`,[receipt.source_type==='import'?receipt.source_id:null,item.product_id,
                item.batch_number||`${receipt.receipt_number}-${item.id.slice(0,8)}`,item.expiration_date||'2099-12-31',item.unit_cost||0]);
            batchId = batch.rows[0].id;
            await client.query('UPDATE goods_receipt_items SET batch_id=$1 WHERE id=$2',[batchId,item.id]);
            const stocked = held ? received : accepted;
            if (stocked > 0) {
              const targetLocation=await client.query(`SELECT id,code FROM storage_locations WHERE warehouse_id=$1 AND company_id=$2 AND status='active'
                ORDER BY CASE WHEN code=$3 THEN 0 WHEN is_default THEN 1 ELSE 2 END LIMIT 1`,[targetWarehouseId,companyId,item.temporary_location||'']);
              if(!targetLocation.rowCount) throw new NotFoundException('No hay una ubicación activa para recibir la mercancía.');
              await this.validateStorageCapacity(client,companyId,targetLocation.rows[0].id,item.product_id,stocked);
              const inventory = await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location)
                VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status)
                DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,
                [batchId,targetWarehouseId,targetLocation.rows[0].id,held?'quarantine':'available',stocked,item.temporary_location||targetLocation.rows[0].code]);
              for(const serial of (Array.isArray(item.serial_numbers)?item.serial_numbers:[])){const serialNumber=String(serial).trim();if(serialNumber)await client.query(`INSERT INTO inventory_unit_serials(company_id,product_id,batch_id,inventory_id,serial_number,status,source_reference) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(company_id,serial_number) DO NOTHING`,[companyId,item.product_id,batchId,inventory.rows[0].id,serialNumber,held?'quarantine':'in_stock',receipt.receipt_number]);}
              await client.query(`INSERT INTO stock_movements(inventory_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by)
                VALUES($1,$2,'purchase',$3,$4,$5,$6)`,[inventory.rows[0].id,batchId,stocked,receiptId,
                  held?`Recepción en cuarentena ${receipt.receipt_number}`:`Recepción aprobada ${receipt.receipt_number}`,userId]);
            }
          }
          if (item.source_line_id && receipt.source_type==='purchase_order') {
            await client.query('UPDATE purchase_order_items SET received_quantity=LEAST(ordered_quantity,received_quantity+$1) WHERE id=$2',[received,item.source_line_id]);
          } else if (item.source_line_id && receipt.source_type==='import') {
            await client.query('UPDATE import_items SET received_quantity=LEAST(expected_quantity,received_quantity+$1) WHERE id=$2',[received,item.source_line_id]);
          }
        }
      }
      if (receipt.source_type==='purchase_order') await client.query(`UPDATE purchase_orders SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM purchase_order_items WHERE purchase_order_id=$1 AND received_quantity<ordered_quantity) THEN 'received' WHEN EXISTS(SELECT 1 FROM purchase_order_items WHERE purchase_order_id=$1 AND received_quantity>0) THEN 'partial' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[receipt.source_id]);
      if (receipt.source_type==='import') await client.query(`UPDATE imports SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM import_items WHERE import_id=$1 AND received_quantity<expected_quantity) THEN 'WAREHOUSE' ELSE 'PARTIAL' END,actual_arrival=COALESCE(actual_arrival,CURRENT_DATE),updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[receipt.source_id]);
      await client.query("UPDATE goods_receipts SET status='closed',closed_by=$1,closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$2",[userId,receiptId]);
      await client.query('SELECT sync_goods_receipt_to_enterprise_fifo($1, $2, $3)', [companyId, receiptId, userId]);
      await completeLogisticsRequest(client,companyId,'receiving.close',idempotencyKey,payload,{id:receiptId});
      await client.query('COMMIT');
      return this.getReceipt(companyId,receiptId);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async assertOpen(companyId: string, id: string) {
    const result=await this.db.query("SELECT 1 FROM goods_receipts WHERE id=$1 AND company_id=$2 AND status<>'closed' FOR UPDATE",[id,companyId]);
    if (!result.rowCount) throw new NotFoundException('Recepción no encontrada o ya cerrada.');
  }

  private async validateStorageCapacity(client:any,companyId:string,locationId:string,productId:string,quantity:number) {
    const [locationResult,productResult]=await Promise.all([
      client.query('SELECT * FROM storage_locations WHERE id=$1 AND company_id=$2 AND status=\'active\' FOR UPDATE',[locationId,companyId]),
      client.query(`SELECT p.category,COALESCE(lp.gross_weight,p.weight_kg) weight_kg,
        COALESCE(lp.volume,p.volume_m3) volume_m3,p.is_hazardous,p.hazard_class,
        COALESCE(lp.units_per_pallet,p.units_per_pallet) units_per_pallet
        FROM products p LEFT JOIN LATERAL (SELECT gross_weight,volume,units_per_pallet FROM product_logistics_profiles
          WHERE product_id=p.id AND valid_from<=CURRENT_DATE AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)
          ORDER BY valid_from DESC LIMIT 1) lp ON TRUE WHERE p.id=$1`,[productId]),
    ]);
    if(!locationResult.rowCount||!productResult.rowCount) throw new NotFoundException('La ubicación o el producto ya no están disponibles.');
    const location=locationResult.rows[0],product=productResult.rows[0];
    const occupied=await client.query(`SELECT COALESCE(SUM(i.quantity),0) units,COALESCE(SUM(i.quantity*p.weight_kg),0) weight,
      COALESCE(SUM(i.quantity*p.volume_m3),0) volume,COALESCE(SUM(i.quantity/p.units_per_pallet),0) pallets,COALESCE(ARRAY_AGG(DISTINCT p.category) FILTER(WHERE i.quantity>0),'{}') categories
      FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id WHERE i.storage_location_id=$1`,[locationId]);
    const stock=occupied.rows[0];
    if(location.capacity_units>0&&Number(stock.units)+quantity>Number(location.capacity_units)) throw new ConflictException('La ubicación no tiene capacidad suficiente en unidades.');
    if(location.capacity_weight_kg>0&&Number(stock.weight)+quantity*Number(product.weight_kg)>Number(location.capacity_weight_kg)) throw new ConflictException('La ubicación no tiene capacidad suficiente en peso.');
    if(location.capacity_volume_m3>0&&Number(stock.volume)+quantity*Number(product.volume_m3)>Number(location.capacity_volume_m3)) throw new ConflictException('La ubicación no tiene capacidad suficiente en volumen.');
    if(location.capacity_pallets>0&&Number(stock.pallets)+quantity/Number(product.units_per_pallet)>Number(location.capacity_pallets)) throw new ConflictException('La ubicación no tiene capacidad suficiente en pallets.');
    if(!location.allow_mixed_products&&stock.categories.length&& !stock.categories.includes(product.category)) throw new ConflictException('La ubicación no permite mezclar esta categoría de producto.');
    if(location.compatible_categories.length&&!location.compatible_categories.includes(product.category)) throw new ConflictException('La categoría del producto no es compatible con la ubicación.');
    if(product.is_hazardous&&(!location.allows_hazardous||(location.allowed_hazard_classes.length&&!location.allowed_hazard_classes.includes(product.hazard_class)))) throw new ConflictException('La ubicación no admite esta clase de producto peligroso.');
  }
}
