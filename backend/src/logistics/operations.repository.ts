import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { decrementInventory } from '../common/logistics-idempotency';
import { claimLogisticsRequest, completeLogisticsRequest } from '../common/logistics-idempotency';

@Injectable()
export class LogisticsOperationsRepository {
  constructor(private readonly db: DatabaseService) {}

  async returnsContext(companyId: string) {
    const [sales, receipts, warehouses, products, saleLines, receiptLines] = await Promise.all([
      this.db.query(`SELECT s.id,s.sale_number,s.sale_date,c.name customer_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.company_id=$1 AND s.status='completed' ORDER BY s.sale_date DESC LIMIT 200`, [companyId]),
      this.db.query(`SELECT gr.id,gr.receipt_number,gr.source_type,gr.created_at,s.name supplier_name FROM goods_receipts gr LEFT JOIN suppliers s ON s.id=gr.supplier_id WHERE gr.company_id=$1 AND gr.status='closed' AND gr.supplier_id IS NOT NULL ORDER BY gr.created_at DESC LIMIT 200`, [companyId]),
      this.db.query(`SELECT id,name,code,type FROM warehouses WHERE company_id=$1 AND is_active=true AND type='physical' ORDER BY name`, [companyId]),
      this.db.query(`SELECT p.id product_id,p.name product_name,p.sku,b.id batch_id,b.batch_number,b.expiration_date,i.id inventory_id,i.quantity,i.warehouse_id,i.storage_location_id,i.stock_status,l.code location_code,w.name warehouse_name
        FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=i.warehouse_id JOIN storage_locations l ON l.id=i.storage_location_id
        WHERE w.company_id=$1 AND i.quantity>0 ORDER BY p.name,b.expiration_date NULLS LAST LIMIT 1000`, [companyId]),
      this.db.query(`SELECT si.id source_line_id,si.sale_id,si.quantity,si.unit_price,p.id product_id,p.name product_name,p.sku,b.id batch_id,b.batch_number,
        GREATEST(0,si.quantity-COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.sale_item_id=si.id AND r.status<>'rejected'),0)) available_quantity
        FROM sales_items si JOIN sales s ON s.id=si.sale_id JOIN product_batches b ON b.id=si.batch_id JOIN products p ON p.id=b.product_id WHERE s.company_id=$1 AND s.status='completed' ORDER BY s.sale_date DESC,p.name LIMIT 2000`,[companyId]),
      this.db.query(`SELECT gri.id source_line_id,gr.id receipt_id,gri.received_quantity,p.id product_id,p.name product_name,p.sku,pb.id batch_id,pb.batch_number,
        GREATEST(0,gri.received_quantity-COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.receipt_item_id=gri.id AND r.status<>'rejected'),0)) available_quantity
        FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id=gri.receipt_id JOIN products p ON p.id=gri.product_id LEFT JOIN product_batches pb ON pb.id=gri.batch_id WHERE gr.company_id=$1 AND gr.status='closed' AND gr.supplier_id IS NOT NULL ORDER BY gr.created_at DESC,p.name LIMIT 2000`,[companyId]),
    ]);
    return { sales: sales.rows, receipts: receipts.rows, warehouses: warehouses.rows, inventory: products.rows, sale_lines:saleLines.rows, receipt_lines:receiptLines.rows };
  }

  async listReturns(companyId: string) {
    return (await this.db.query(`SELECT r.*,s.sale_number,fo.fulfillment_number,gr.receipt_number source_receipt_number,c.name customer_name,sup.name supplier_name,w.name warehouse_name,
        COUNT(ri.id)::int line_count,COALESCE(SUM(ri.quantity),0)::int requested_units,COALESCE(SUM(ri.received_quantity),0)::int received_units,
        COALESCE((SELECT json_agg(json_build_object('id',x.id,'product_id',x.product_id,'product_name',p.name,'sku',p.sku,'batch_number',b.batch_number,'quantity',x.quantity,'received_quantity',x.received_quantity,'condition',x.condition,'disposition',x.disposition,'notes',x.notes) ORDER BY p.name)
          FROM return_items x LEFT JOIN products p ON p.id=x.product_id LEFT JOIN product_batches b ON b.id=x.batch_id WHERE x.return_id=r.id),'[]'::json) items,
        COALESCE((SELECT json_agg(json_build_object('event_type',ev.event_type,'notes',ev.notes,'created_at',ev.created_at,'created_by_name',u.username) ORDER BY ev.created_at DESC) FROM logistics_return_events ev LEFT JOIN users u ON u.id=ev.created_by WHERE ev.return_id=r.id),'[]'::json) events
      FROM returns r LEFT JOIN sales s ON s.id=r.sale_id LEFT JOIN fulfillment_orders fo ON fo.id=r.fulfillment_order_id LEFT JOIN goods_receipts gr ON gr.id=r.source_receipt_id
      LEFT JOIN customers c ON c.id=r.customer_id LEFT JOIN suppliers sup ON sup.id=r.supplier_id LEFT JOIN warehouses w ON w.id=r.warehouse_id
      LEFT JOIN return_items ri ON ri.return_id=r.id WHERE r.company_id=$1 GROUP BY r.id,s.sale_number,fo.fulfillment_number,gr.receipt_number,c.name,sup.name,w.name ORDER BY r.created_at DESC LIMIT 300`, [companyId])).rows;
  }

  async createReturn(companyId: string, userId: string, data: any) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      if (!['customer', 'supplier'].includes(data.direction)) throw new BadRequestException('Selecciona devolución de cliente o a proveedor.');
      if (!Array.isArray(data.items) || data.items.length === 0) throw new BadRequestException('Agrega al menos un artículo.');
      let saleId: string | null = null, customerId: string | null = null, supplierId: string | null = null, fulfillmentId: string | null = null;
      if (data.direction === 'customer') {
        const source = await client.query(`SELECT s.id,s.customer_id,fo.id fulfillment_order_id FROM sales s LEFT JOIN fulfillment_orders fo ON fo.sale_id=s.id AND fo.status='dispatched' WHERE s.company_id=$1 AND s.id=$2 AND s.status='completed' ORDER BY fo.completed_at DESC NULLS LAST LIMIT 1 FOR UPDATE OF s`, [companyId, data.sale_id]);
        if (!source.rowCount) throw new NotFoundException('Venta completada no encontrada para esta empresa.');
        saleId = source.rows[0].id; customerId = source.rows[0].customer_id; fulfillmentId = source.rows[0].fulfillment_order_id;
      } else {
        const source = await client.query(`SELECT id,supplier_id FROM goods_receipts WHERE company_id=$1 AND id=$2 AND status='closed' FOR UPDATE`, [companyId, data.receipt_id]);
        if (!source.rowCount) throw new NotFoundException('Recepción cerrada del proveedor no encontrada.');
        supplierId = source.rows[0].supplier_id;
      }
      if(data.warehouse_id){const wh=await client.query("SELECT id FROM warehouses WHERE company_id=$1 AND id=$2 AND is_active=true AND type='physical'",[companyId,data.warehouse_id]);if(!wh.rowCount)throw new NotFoundException('La bodega seleccionada no pertenece a esta empresa o no es física.');}
      const seq = await client.query("SELECT nextval('logistics_return_number_seq') n");
      const number = `DEV-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(6, '0')}`;
      const header = await client.query(`INSERT INTO returns(company_id,return_number,direction,sale_id,customer_id,supplier_id,source_receipt_id,fulfillment_order_id,warehouse_id,reason,status,transport_cost,warranty_until,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12,$13) RETURNING *`, [companyId, number, data.direction, saleId, customerId, supplierId, data.direction==='supplier'?data.receipt_id:null, fulfillmentId, data.warehouse_id || null, String(data.reason).trim(), Number(data.transport_cost || 0), data.warranty_until || null, userId || null]);
      for (const line of data.items) {
        const qty = Number(line.quantity);
        if (!Number.isInteger(qty) || qty < 1) throw new BadRequestException('Las cantidades solicitadas deben ser enteros positivos.');
        if (data.direction === 'customer') {
          const src = await client.query(`SELECT si.id,si.batch_id,si.quantity,p.id product_id FROM sales_items si JOIN sales s ON s.id=si.sale_id JOIN product_batches b ON b.id=si.batch_id JOIN products p ON p.id=b.product_id WHERE s.company_id=$1 AND si.sale_id=$2 AND si.id=$3 FOR UPDATE OF si`, [companyId, saleId, line.source_line_id]);
          if (!src.rowCount) throw new BadRequestException('El artículo no pertenece a la venta original.');
          const previous = await client.query(`SELECT COALESCE(SUM(ri.quantity),0)::int units FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.sale_item_id=$1 AND r.status<>'rejected'`, [src.rows[0].id]);
          if (qty + Number(previous.rows[0].units) > Number(src.rows[0].quantity)) throw new ConflictException('La cantidad solicitada supera las unidades netas vendidas.');
          await client.query(`INSERT INTO return_items(return_id,sale_item_id,product_id,batch_id,quantity,disposition,condition,notes) VALUES($1,$2,$3,$4,$5,'quarantine','unknown',$6)`, [header.rows[0].id, src.rows[0].id, src.rows[0].product_id, src.rows[0].batch_id, qty, line.notes || null]);
        } else {
          const src = await client.query(`SELECT gri.id,gri.product_id,gri.batch_id,gri.received_quantity FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id=gri.receipt_id JOIN products p ON p.id=gri.product_id WHERE gr.company_id=$1 AND gr.id=$2 AND gri.id=$3 FOR UPDATE OF gri`, [companyId, data.receipt_id, line.source_line_id]);
          if (!src.rowCount || !src.rows[0].batch_id) throw new BadRequestException('El artículo no pertenece a la recepción o no tiene lote asociado.');
          const previous = await client.query(`SELECT COALESCE(SUM(ri.quantity),0)::int units FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.receipt_item_id=$1 AND r.status<>'rejected'`, [src.rows[0].id]);
          if (qty + Number(previous.rows[0].units) > Number(src.rows[0].received_quantity)) throw new ConflictException('La cantidad solicitada supera lo recibido del proveedor.');
          await client.query(`INSERT INTO return_items(return_id,receipt_item_id,product_id,batch_id,quantity,disposition,condition,notes) VALUES($1,$2,$3,$4,$5,'quarantine','unknown',$6)`, [header.rows[0].id, src.rows[0].id, src.rows[0].product_id, src.rows[0].batch_id, qty, line.notes || null]);
        }
      }
      await this.returnEvent(client, companyId, header.rows[0].id, 'created', userId, data.reason);
      await client.query('COMMIT'); return header.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async authorizeReturn(companyId: string, userId: string, id: string, data: any) {
    const client = await this.db.getPool().connect();
    try { await client.query('BEGIN');
      const ret = await client.query("UPDATE returns SET status='authorized',authorization_notes=$3,updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2 AND status='pending' RETURNING *", [companyId,id,data.notes||null]);
      if (!ret.rowCount) throw new ConflictException('La devolución ya no está pendiente de autorización.');
      await this.returnEvent(client,companyId,id,'authorized',userId,data.notes); await client.query('COMMIT'); return ret.rows[0];
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async shipSupplierReturn(companyId:string,userId:string,id:string,data:any){
    const client=await this.db.getPool().connect();
    try{await client.query('BEGIN');
      const ret=await client.query("SELECT * FROM returns WHERE company_id=$1 AND id=$2 AND direction='supplier' AND status='authorized' FOR UPDATE",[companyId,id]);
      if(!ret.rowCount)throw new ConflictException('La devolución al proveedor debe estar autorizada antes del despacho.');
      const lines=await client.query('SELECT * FROM return_items WHERE return_id=$1 FOR UPDATE',[id]);
      for(const line of lines.rows){let remaining=Number(line.quantity);const stock=await client.query(`SELECT i.* FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id WHERE w.company_id=$1 AND ($2::uuid IS NULL OR i.warehouse_id=$2) AND i.batch_id=$3 AND i.stock_status IN ('available','quarantine','damaged') AND i.quantity>0 ORDER BY CASE i.stock_status WHEN 'quarantine' THEN 0 WHEN 'damaged' THEN 1 ELSE 2 END,i.quantity DESC FOR UPDATE OF i`,[companyId,ret.rows[0].warehouse_id,line.batch_id]);
        for(const row of stock.rows){if(remaining<=0)break;const quantity=Math.min(remaining,Number(row.quantity));await decrementInventory(client,row.id,quantity);await client.query(`INSERT INTO stock_movements(inventory_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by) VALUES($1,$2,'return',$3,$4,$5,$6)`,[row.id,line.batch_id,-quantity,id,`Salida a proveedor ${ret.rows[0].return_number}`,userId||null]);remaining-=quantity;}
        if(remaining>0)throw new ConflictException(`No hay saldo libre suficiente del lote solicitado para devolver ${line.quantity} unidades al proveedor.`);
      }
      const done=await client.query("UPDATE returns SET status='resolved',resolution='supplier_credit',resolved_by=$3,resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2 RETURNING *",[companyId,id,userId||null]);
      await this.returnEvent(client,companyId,id,'shipped_to_supplier',userId,data.notes||'Salida de inventario confirmada');await client.query('COMMIT');return done.rows[0];
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async receiveReturn(companyId: string, userId: string, id: string, data: any) {
    const client = await this.db.getPool().connect();
    try { await client.query('BEGIN');
      const warehouse=await client.query("SELECT id FROM warehouses WHERE company_id=$1 AND id=$2 AND is_active=true AND type='physical'",[companyId,data.warehouse_id]);if(!warehouse.rowCount)throw new NotFoundException('La bodega de recepción no pertenece a esta empresa o no es física.');
      const ret = await client.query("SELECT * FROM returns WHERE company_id=$1 AND id=$2 AND status='authorized' FOR UPDATE",[companyId,id]);
      if (!ret.rowCount) throw new ConflictException('Autoriza la devolución antes de recibirla.');
      const lines = await client.query('SELECT * FROM return_items WHERE return_id=$1 FOR UPDATE',[id]);
      const receivedMap = new Map<string,number>((data.items||[]).map((item:any)=>[String(item.id),Number(item.received_quantity)]));
      for (const line of lines.rows) {
        const received = receivedMap.has(line.id)?receivedMap.get(line.id)!:Number(line.quantity);
        if (!Number.isInteger(received)||received<0||received>Number(line.quantity)) throw new BadRequestException('La cantidad recibida debe estar entre cero y lo autorizado.');
        await client.query('UPDATE return_items SET received_quantity=$1 WHERE id=$2',[received,line.id]); receivedMap.delete(line.id);
      }
      if (receivedMap.size) throw new BadRequestException('Hay líneas que no pertenecen a esta devolución.');
      const updated = await client.query("UPDATE returns SET status='received',warehouse_id=COALESCE($3,warehouse_id),updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND company_id=$2 RETURNING *",[id,companyId,data.warehouse_id||null]);
      await this.returnEvent(client,companyId,id,'received',userId,data.notes); await client.query('COMMIT'); return updated.rows[0];
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async inspectReturn(companyId: string, userId: string, id: string, data: any) {
    const client = await this.db.getPool().connect();
    try { await client.query('BEGIN');
      const ret = await client.query("SELECT * FROM returns WHERE company_id=$1 AND id=$2 AND status='received' FOR UPDATE",[companyId,id]);
      if (!ret.rowCount) throw new ConflictException('Primero registra la recepción física.');
      const lines = await client.query('SELECT * FROM return_items WHERE return_id=$1 FOR UPDATE',[id]);
      const allowed = ['sellable','repair','quarantine','scrap'];
      for (const input of (data.items||[])) {
        if (!allowed.includes(input.disposition)||!['sealed','opened','damaged','defective','unknown'].includes(input.condition)) throw new BadRequestException('Clasificación o estado de inspección inválido.');
        const line = lines.rows.find((row:any)=>row.id===input.id); if (!line) throw new BadRequestException('Artículo ajeno a la devolución.');
        if (Number(line.received_quantity)>0) await client.query('UPDATE return_items SET disposition=$1,condition=$2,notes=COALESCE($3,notes),inspected_by=$4 WHERE id=$5',[input.disposition,input.condition,input.notes||null,userId||null,input.id]);
      }
      const inspected = await client.query("UPDATE returns SET status='inspected',inspection_notes=$3,updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2 RETURNING *",[companyId,id,data.notes||null]);
      await this.returnEvent(client,companyId,id,'inspected',userId,data.notes); await client.query('COMMIT'); return inspected.rows[0];
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async resolveReturn(companyId: string, userId: string, id: string, data: any) {
    const client = await this.db.getPool().connect();
    try { await client.query('BEGIN');
      const ret = await client.query("SELECT * FROM returns WHERE company_id=$1 AND id=$2 AND status='inspected' FOR UPDATE",[companyId,id]);
      if (!ret.rowCount) throw new ConflictException('Completa la inspección antes de resolver.');
      const lines = await client.query(`SELECT ri.*,b.product_id,p.name product_name FROM return_items ri JOIN product_batches b ON b.id=ri.batch_id JOIN products p ON p.id=b.product_id WHERE ri.return_id=$1 FOR UPDATE OF ri`,[id]);
      for (const line of lines.rows) {
        const qty=Number(line.received_quantity); if (!qty) continue;
        const finalDisposition=data.resolution==='repair'||data.resolution==='quarantine'?'quarantine':data.resolution==='scrap'?'scrap':line.disposition;
        if (finalDisposition==='sellable') {
          const targetStatus='available';
          const location = await client.query(`SELECT l.id,l.code FROM storage_locations l JOIN warehouses w ON w.id=l.warehouse_id WHERE w.company_id=$1 AND l.warehouse_id=COALESCE($2, (SELECT warehouse_id FROM inventory WHERE batch_id=$3 AND stock_status='available' ORDER BY quantity DESC LIMIT 1)) AND l.status='active' AND l.location_type='storage' ORDER BY l.is_default DESC,l.code LIMIT 1`,[companyId,ret.rows[0].warehouse_id,line.batch_id]);
          if (!location.rowCount) throw new ConflictException('No hay una ubicación de almacenamiento activa para reingresar el producto vendible.');
          const stock=await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location) SELECT $1,$2,$3,'available',$4,$5 ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,[line.batch_id,(await client.query('SELECT warehouse_id FROM storage_locations WHERE id=$1',[location.rows[0].id])).rows[0].warehouse_id,location.rows[0].id,qty,location.rows[0].code]);
          await client.query('UPDATE return_items SET inventory_id=$1 WHERE id=$2',[stock.rows[0].id,line.id]);
          await client.query(`INSERT INTO stock_movements(inventory_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by) VALUES($1,$2,'return',$3,$4,$5,$6)`,[stock.rows[0].id,line.batch_id,qty,id,`Reingreso vendible ${ret.rows[0].return_number}`,userId||null]);
        } else if (finalDisposition==='quarantine') {
          const q = await client.query(`SELECT id,code FROM storage_locations WHERE company_id=$1 AND warehouse_id=$2 AND location_type='quarantine' AND status='active' LIMIT 1`,[companyId,ret.rows[0].warehouse_id]);
          if (!q.rowCount) throw new ConflictException('Configura una ubicación de cuarentena para esta bodega antes de cerrar.');
          const wh=await client.query('SELECT warehouse_id FROM storage_locations WHERE id=$1',[q.rows[0].id]);
          const stock=await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location) VALUES($1,$2,$3,'quarantine',$4,$5) ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,[line.batch_id,wh.rows[0].warehouse_id,q.rows[0].id,qty,q.rows[0].code]);
          await client.query('UPDATE return_items SET inventory_id=$1 WHERE id=$2',[stock.rows[0].id,line.id]);
          await client.query(`INSERT INTO stock_movements(inventory_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by) VALUES($1,$2,'return',0,$3,$4,$5)`,[stock.rows[0].id,line.batch_id,id,`Devolución retenida en cuarentena ${ret.rows[0].return_number}`,userId||null]);
        }
      }
      const resolved=await client.query("UPDATE returns SET status='resolved',resolution=$3,resolved_by=$4,resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2 RETURNING *",[companyId,id,data.resolution,userId||null]);
      await this.returnEvent(client,companyId,id,'resolved',userId,data.notes); await client.query('COMMIT'); return resolved.rows[0];
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async rejectReturn(companyId:string,userId:string,id:string,notes:string){
    const result=await this.db.query("UPDATE returns SET status='rejected',authorization_notes=$3,updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2 AND status='pending' RETURNING *",[companyId,id,notes]);
    if(!result.rowCount)throw new ConflictException('Solo se pueden rechazar devoluciones pendientes.');
    await this.db.query(`INSERT INTO logistics_return_events(company_id,return_id,event_type,notes,created_by) VALUES($1,$2,'rejected',$3,$4)`,[companyId,id,notes,userId||null]); return result.rows[0];
  }

  async inventoryContext(companyId:string){
    const [stock,warehouses,serials,counts]=await Promise.all([
      this.db.query(`SELECT (array_agg(i.id ORDER BY i.id))[1]::text inventory_id,i.batch_id,p.id product_id,p.name product_name,p.sku,b.batch_number,b.expiration_date,w.id warehouse_id,w.name warehouse_name,l.id location_id,l.code location_code,string_agg(DISTINCT i.stock_status,',') stock_status,
        SUM(i.quantity)::int physical_quantity,COALESCE(SUM(i.quantity) FILTER(WHERE i.stock_status='reserved'),0)::int reserved_quantity,
        COALESCE(SUM(i.quantity) FILTER(WHERE i.stock_status='available'),0)::int available_quantity,
        COALESCE(SUM(i.quantity) FILTER(WHERE i.stock_status='quarantine'),0)::int quarantine_quantity,COALESCE(SUM(i.quantity) FILTER(WHERE i.stock_status='damaged'),0)::int damaged_quantity,COALESCE(trans.quantity,0)::int transit_quantity
        FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id JOIN storage_locations l ON l.id=i.storage_location_id JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id
        LEFT JOIN LATERAL(SELECT SUM(ti.quantity-ti.received_quantity) quantity FROM warehouse_transfer_items ti JOIN warehouse_transfers t ON t.id=ti.transfer_id WHERE ti.batch_id=i.batch_id AND t.target_warehouse_id=i.warehouse_id AND t.status IN ('in_transit','partial')) trans ON true
        WHERE w.company_id=$1 GROUP BY i.batch_id,p.id,p.name,p.sku,b.batch_number,b.expiration_date,w.id,w.name,l.id,l.code,trans.quantity ORDER BY p.name,b.expiration_date NULLS LAST,w.name,l.code LIMIT 2000`,[companyId]),
      this.db.query("SELECT id,name,code,type FROM warehouses WHERE company_id=$1 AND is_active=true AND type='physical' ORDER BY name",[companyId]),
      this.db.query(`SELECT us.*,p.name product_name,p.sku,b.batch_number,w.name warehouse_name,l.code location_code FROM inventory_unit_serials us JOIN products p ON p.id=us.product_id JOIN product_batches b ON b.id=us.batch_id LEFT JOIN inventory i ON i.id=us.inventory_id LEFT JOIN warehouses w ON w.id=i.warehouse_id LEFT JOIN storage_locations l ON l.id=i.storage_location_id WHERE us.company_id=$1 ORDER BY us.updated_at DESC LIMIT 1000`,[companyId]),
      this.listCounts(companyId),
    ]);
    return {stock:stock.rows,warehouses:warehouses.rows,serials:serials.rows,counts};
  }

  async listCounts(companyId:string){
    return (await this.db.query(`SELECT c.*,w.name warehouse_name,u.username created_by_name,COUNT(l.id)::int line_count,COUNT(l.id) FILTER(WHERE l.counted_quantity IS NOT NULL)::int counted_lines,COUNT(l.id) FILTER(WHERE l.counted_quantity IS NOT NULL AND l.counted_quantity<>l.expected_quantity)::int variance_lines FROM logistics_inventory_counts c JOIN warehouses w ON w.id=c.warehouse_id LEFT JOIN users u ON u.id=c.created_by LEFT JOIN logistics_inventory_count_lines l ON l.count_id=c.id WHERE c.company_id=$1 GROUP BY c.id,w.name,u.username ORDER BY c.created_at DESC LIMIT 200`,[companyId])).rows;
  }

  async countDetails(companyId:string,id:string){
    const header=await this.db.query('SELECT c.*,w.name warehouse_name FROM logistics_inventory_counts c JOIN warehouses w ON w.id=c.warehouse_id WHERE c.company_id=$1 AND c.id=$2',[companyId,id]);
    if(!header.rowCount)throw new NotFoundException('Conteo no encontrado.');
    const lines=await this.db.query(`SELECT l.*,p.name product_name,p.sku,b.batch_number,b.expiration_date,sl.code location_code,i.stock_status FROM logistics_inventory_count_lines l JOIN inventory i ON i.id=l.inventory_id JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id JOIN storage_locations sl ON sl.id=i.storage_location_id WHERE l.count_id=$1 ORDER BY p.name,b.batch_number,sl.code`,[id]);
    return {...header.rows[0],lines:lines.rows};
  }

  async createCount(companyId:string,userId:string,data:any,idempotencyKey?:string){
    const client=await this.db.getPool().connect();
    try{await client.query('BEGIN');const cached=await claimLogisticsRequest(client,companyId,'inventory-count.create',idempotencyKey,data);if(cached){await client.query('COMMIT');return cached;}
      const warehouse=await client.query("SELECT id FROM warehouses WHERE company_id=$1 AND id=$2 AND is_active=true AND type='physical'",[companyId,data.warehouse_id]);if(!warehouse.rowCount)throw new NotFoundException('Bodega física no encontrada.');
      const seq=await client.query("SELECT nextval('logistics_count_number_seq') n");const number=`INV-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(6,'0')}`;
      const header=await client.query(`INSERT INTO logistics_inventory_counts(company_id,warehouse_id,count_number,count_type,notes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[companyId,data.warehouse_id,number,data.count_type||'cycle',data.notes||null,userId||null]);
      await client.query(`INSERT INTO logistics_inventory_count_lines(count_id,inventory_id,expected_quantity) SELECT $1,i.id,i.quantity FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id WHERE w.company_id=$2 AND w.id=$3 AND ($4='full' OR i.quantity>0)`,[header.rows[0].id,companyId,data.warehouse_id,data.count_type||'cycle']);
      await completeLogisticsRequest(client,companyId,'inventory-count.create',idempotencyKey,data,header.rows[0]);await client.query('COMMIT');return header.rows[0];
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async saveCount(companyId:string,userId:string,id:string,data:any,idempotencyKey?:string){
    if(!Array.isArray(data.lines)||!data.lines.length)throw new BadRequestException('Ingresa al menos una línea del conteo.');
    const client=await this.db.getPool().connect();
    try{await client.query('BEGIN');const payload={count_id:id,data};const cached=await claimLogisticsRequest(client,companyId,'inventory-count.save',idempotencyKey,payload);if(cached){await client.query('COMMIT');return this.countDetails(companyId,cached.id);}const count=await client.query("SELECT * FROM logistics_inventory_counts WHERE company_id=$1 AND id=$2 AND status='counting' FOR UPDATE",[companyId,id]);if(!count.rowCount)throw new ConflictException('El conteo no está abierto para registrar cantidades.');
      for(const input of data.lines){const qty=Number(input.counted_quantity);if(!Number.isInteger(qty)||qty<0)throw new BadRequestException('Las cantidades contadas deben ser enteros iguales o mayores que cero.');const updated=await client.query('UPDATE logistics_inventory_count_lines SET counted_quantity=$1,reason=$2,counted_by=$3,counted_at=CURRENT_TIMESTAMP WHERE count_id=$4 AND id=$5 RETURNING id',[qty,input.reason||null,userId||null,id,input.id]);if(!updated.rowCount)throw new BadRequestException('Línea fuera de este conteo.');}
      await completeLogisticsRequest(client,companyId,'inventory-count.save',idempotencyKey,payload,{id});await client.query('COMMIT');return this.countDetails(companyId,id);
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async submitCount(companyId:string,userId:string,id:string){const r=await this.db.query(`UPDATE logistics_inventory_counts c SET status='submitted',submitted_by=$3,submitted_at=CURRENT_TIMESTAMP WHERE c.company_id=$1 AND c.id=$2 AND c.status='counting' AND NOT EXISTS(SELECT 1 FROM logistics_inventory_count_lines l WHERE l.count_id=c.id AND l.counted_quantity IS NULL) RETURNING c.*`,[companyId,id,userId||null]);if(!r.rowCount)throw new ConflictException('Registra todas las líneas antes de enviar el conteo para conciliación.');return r.rows[0];}

  async reconcileCount(companyId:string,userId:string,id:string,idempotencyKey?:string){
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');const payload={count_id:id};const cached=await claimLogisticsRequest(client,companyId,'inventory-count.reconcile',idempotencyKey,payload);if(cached){await client.query('COMMIT');return cached;}const count=await client.query("SELECT * FROM logistics_inventory_counts WHERE company_id=$1 AND id=$2 AND status='submitted' FOR UPDATE",[companyId,id]);if(!count.rowCount)throw new ConflictException('El conteo debe estar enviado y pendiente de conciliación.');
      const lines=await client.query('SELECT l.*,i.quantity current_quantity,i.batch_id,i.warehouse_id,i.stock_status,p.name product_name FROM logistics_inventory_count_lines l JOIN inventory i ON i.id=l.inventory_id JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id WHERE l.count_id=$1 FOR UPDATE OF i,l',[id]);
      for(const line of lines.rows){if(Number(line.current_quantity)!==Number(line.expected_quantity))throw new ConflictException(`Cambió el saldo de ${line.product_name} durante el conteo. Actualiza el conteo antes de conciliar.`);const diff=Number(line.counted_quantity)-Number(line.expected_quantity);if(diff){await client.query('UPDATE inventory SET quantity=$1,last_updated=CURRENT_TIMESTAMP WHERE id=$2',[line.counted_quantity,line.inventory_id]);await client.query(`INSERT INTO stock_movements(inventory_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by) VALUES($1,$2,'adjustment',$3,$4,$5,$6)`,[line.inventory_id,line.batch_id,diff,id,`Conciliación ${count.rows[0].count_number}: ${line.reason||'diferencia de conteo'}`,userId||null]);}}
      const done=await client.query("UPDATE logistics_inventory_counts SET status='reconciled',reconciled_by=$3,reconciled_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2 RETURNING *",[companyId,id,userId||null]);await completeLogisticsRequest(client,companyId,'inventory-count.reconcile',idempotencyKey,payload,done.rows[0]);await client.query('COMMIT');return done.rows[0];
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}

  async serialTrace(companyId:string,query:string){
    return (await this.db.query(`SELECT us.*,p.name product_name,p.sku,b.batch_number,b.expiration_date,w.name warehouse_name,l.code location_code,
      COALESCE((SELECT json_agg(json_build_object('movement_type',sm.movement_type,'quantity_change',sm.quantity_change,'reference_id',sm.reference_id,'notes',sm.notes,'created_at',sm.created_at) ORDER BY sm.created_at DESC) FROM stock_movements sm WHERE sm.batch_id=us.batch_id),'[]'::json) batch_movements
      FROM inventory_unit_serials us JOIN products p ON p.id=us.product_id JOIN product_batches b ON b.id=us.batch_id LEFT JOIN inventory i ON i.id=us.inventory_id LEFT JOIN warehouses w ON w.id=i.warehouse_id LEFT JOIN storage_locations l ON l.id=i.storage_location_id WHERE us.company_id=$1 AND (us.serial_number ILIKE $2 OR p.sku ILIKE $2 OR b.batch_number ILIKE $2) ORDER BY us.updated_at DESC LIMIT 100`,[companyId,`%${query}%`])).rows;
  }

  async traceInventory(companyId:string,query:string){
    return (await this.db.query(`SELECT i.id inventory_id,i.quantity,i.stock_status,p.id product_id,p.name product_name,p.sku,b.id batch_id,b.batch_number,b.expiration_date,w.name warehouse_name,l.code location_code,
      COALESCE((SELECT json_agg(json_build_object('type',sm.movement_type,'quantity',sm.quantity_change,'reference',sm.reference_id,'notes',sm.notes,'date',sm.created_at) ORDER BY sm.created_at DESC) FROM stock_movements sm JOIN inventory si ON si.id=sm.inventory_id JOIN warehouses sw ON sw.id=si.warehouse_id WHERE sm.batch_id=b.id AND sw.company_id=$1),'[]'::json) movements,
      COALESCE((SELECT json_agg(us.serial_number ORDER BY us.serial_number) FROM inventory_unit_serials us WHERE us.inventory_id=i.id),'[]'::json) serial_numbers,
      COALESCE((SELECT json_agg(json_build_object('sale_number',s.sale_number,'customer',c.name,'quantity',si.quantity,'date',s.sale_date) ORDER BY s.sale_date DESC) FROM sales_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN customers c ON c.id=s.customer_id WHERE si.batch_id=b.id AND s.company_id=$1),'[]'::json) sales,
      COALESCE((SELECT json_agg(json_build_object('return_number',r.return_number,'status',r.status,'direction',r.direction,'quantity',ri.quantity,'date',r.created_at) ORDER BY r.created_at DESC) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.batch_id=b.id AND r.company_id=$1),'[]'::json) returns
      FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id JOIN storage_locations l ON l.id=i.storage_location_id JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id
      WHERE w.company_id=$1 AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR b.batch_number ILIKE $2 OR EXISTS(SELECT 1 FROM inventory_unit_serials us WHERE us.inventory_id=i.id AND us.serial_number ILIKE $2))
      ORDER BY p.name,b.batch_number,w.name,l.code LIMIT 250`,[companyId,`%${query}%`])).rows;
  }

  async inventoryMovements(companyId:string){return (await this.db.query(`SELECT sm.*,p.name product_name,p.sku,b.batch_number,w.name warehouse_name,u.username created_by_name FROM stock_movements sm JOIN inventory i ON i.id=sm.inventory_id JOIN warehouses w ON w.id=i.warehouse_id JOIN product_batches b ON b.id=sm.batch_id JOIN products p ON p.id=b.product_id LEFT JOIN users u ON u.id=sm.created_by WHERE w.company_id=$1 ORDER BY sm.created_at DESC LIMIT 500`,[companyId])).rows;}

  private async returnEvent(client:any,companyId:string,returnId:string,type:string,userId:string,notes?:string){await client.query('INSERT INTO logistics_return_events(company_id,return_id,event_type,notes,created_by) VALUES($1,$2,$3,$4,$5)',[companyId,returnId,type,notes||null,userId||null]);}
}
