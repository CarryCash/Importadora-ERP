import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { claimLogisticsRequest, completeLogisticsRequest, decrementInventory } from '../common/logistics-idempotency';

@Injectable()
export class TransfersRepository {
  constructor(private readonly db: DatabaseService) {}

  async context(companyId:string) {
    const [warehouses,locations,inventory]=await Promise.all([
      this.db.query(`SELECT w.id,w.name,w.code,w.type,w.branch_id,b.name branch_name FROM warehouses w JOIN branches b ON b.id=w.branch_id WHERE w.company_id=$1 AND w.is_active ORDER BY b.name,w.name`,[companyId]),
      this.db.query(`SELECT l.id,l.warehouse_id,l.code,l.name,l.location_type,l.status,w.name warehouse_name FROM storage_locations l JOIN warehouses w ON w.id=l.warehouse_id WHERE l.company_id=$1 AND l.status='active' ORDER BY w.name,l.code`,[companyId]),
      this.db.query(`SELECT i.id inventory_id,i.batch_id,i.quantity,i.stock_status,p.id product_id,p.name product_name,p.sku,p.barcode,b.batch_number,b.expiration_date,
        l.id location_id,l.code location_code,w.id warehouse_id,w.name warehouse_name,bh.name branch_name
        FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id JOIN storage_locations l ON l.id=i.storage_location_id
        JOIN warehouses w ON w.id=i.warehouse_id JOIN branches bh ON bh.id=w.branch_id
        WHERE w.company_id=$1 AND i.stock_status='available' AND i.quantity>0 AND w.is_active AND l.status='active'
        ORDER BY w.name,l.code,p.name,b.expiration_date NULLS LAST`,[companyId]),
    ]);
    return {warehouses:warehouses.rows,locations:locations.rows,inventory:inventory.rows};
  }

  async list(companyId: string) {
    return (await this.db.query(`SELECT t.*,fw.name from_warehouse_name,fw.code from_warehouse_code,fb.name from_branch_name,
      tw.name to_warehouse_name,tw.code to_warehouse_code,tb.name to_branch_name,l.code to_location_code,l.name to_location_name,
      ru.full_name requested_by_name,au.full_name approved_by_name,su.full_name shipped_by_name,
      COUNT(DISTINCT ti.id)::int line_count,COALESCE(SUM(ti.requested_quantity),0)::int requested_units,
      COALESCE(SUM(ti.shipped_quantity),0)::int shipped_units,COALESCE(SUM(ti.received_quantity+ti.damaged_quantity+ti.lost_quantity),0)::int resolved_units
      FROM inventory_transfers t JOIN warehouses fw ON fw.id=t.from_warehouse_id JOIN branches fb ON fb.id=fw.branch_id
      JOIN warehouses tw ON tw.id=t.to_warehouse_id JOIN branches tb ON tb.id=tw.branch_id JOIN storage_locations l ON l.id=t.to_location_id
      LEFT JOIN users ru ON ru.id=t.requested_by LEFT JOIN users au ON au.id=t.approved_by LEFT JOIN users su ON su.id=t.shipped_by
      LEFT JOIN inventory_transfer_items ti ON ti.transfer_id=t.id WHERE t.company_id=$1
      GROUP BY t.id,fw.name,fw.code,fb.name,tw.name,tw.code,tb.name,l.code,l.name,ru.full_name,au.full_name,su.full_name
      ORDER BY t.created_at DESC LIMIT 300`,[companyId])).rows;
  }

  async get(companyId: string,id: string) {
    const header=await this.db.query(`SELECT t.*,fw.name from_warehouse_name,fw.code from_warehouse_code,fb.name from_branch_name,
      tw.name to_warehouse_name,tw.code to_warehouse_code,tb.name to_branch_name,l.code to_location_code,l.name to_location_name,
      ru.full_name requested_by_name,au.full_name approved_by_name,su.full_name shipped_by_name,rr.full_name last_received_by_name
      FROM inventory_transfers t JOIN warehouses fw ON fw.id=t.from_warehouse_id JOIN branches fb ON fb.id=fw.branch_id
      JOIN warehouses tw ON tw.id=t.to_warehouse_id JOIN branches tb ON tb.id=tw.branch_id JOIN storage_locations l ON l.id=t.to_location_id
      LEFT JOIN users ru ON ru.id=t.requested_by LEFT JOIN users au ON au.id=t.approved_by LEFT JOIN users su ON su.id=t.shipped_by
      LEFT JOIN users rr ON rr.id=t.last_received_by WHERE t.company_id=$1 AND t.id=$2`,[companyId,id]);
    if(!header.rowCount) throw new NotFoundException('Transferencia no encontrada.');
    const [items,events,receipts]=await Promise.all([
      this.db.query(`SELECT ti.*,p.name product_name,p.sku,p.barcode,b.batch_number,b.expiration_date,
        sl.code source_location_code,sl.name source_location_name,tl.code transit_location_code,
        ti.requested_quantity-ti.shipped_quantity pending_ship_quantity,
        ti.shipped_quantity-ti.received_quantity-ti.damaged_quantity-ti.lost_quantity pending_receive_quantity
        FROM inventory_transfer_items ti JOIN products p ON p.id=ti.product_id JOIN product_batches b ON b.id=ti.batch_id
        JOIN storage_locations sl ON sl.id=ti.source_location_id LEFT JOIN inventory ii ON ii.id=ti.transit_inventory_id
        LEFT JOIN storage_locations tl ON tl.id=ii.storage_location_id WHERE ti.transfer_id=$1 ORDER BY p.name,b.batch_number`,[id]),
      this.db.query(`SELECT e.*,u.full_name created_by_name FROM inventory_transfer_events e LEFT JOIN users u ON u.id=e.created_by
        WHERE e.transfer_id=$1 ORDER BY e.created_at DESC`,[id]),
      this.db.query(`SELECT r.*,u.full_name received_by_name FROM inventory_transfer_receipts r LEFT JOIN users u ON u.id=r.received_by
        WHERE r.transfer_id=$1 ORDER BY r.received_at DESC`,[id]),
    ]);
    const receiptItems=receipts.rowCount?await this.db.query(`SELECT ri.*,p.name product_name,p.sku,b.batch_number
      FROM inventory_transfer_receipt_items ri JOIN inventory_transfer_items ti ON ti.id=ri.transfer_item_id
      JOIN products p ON p.id=ti.product_id JOIN product_batches b ON b.id=ti.batch_id WHERE ri.receipt_id=ANY($1::uuid[])`,[receipts.rows.map((r:any)=>r.id)]):{rows:[]};
    return {...header.rows[0],items:items.rows,events:events.rows,receipts:receipts.rows.map((r:any)=>({...r,items:receiptItems.rows.filter((item:any)=>item.receipt_id===r.id)}))};
  }

  async request(companyId: string,userId: string,data: any,idempotencyKey?:string) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const cached=await claimLogisticsRequest(client,companyId,'transfer.request',idempotencyKey,data);if(cached){await client.query('COMMIT');return cached;}
      const warehouseIds=[...new Set([data.from_warehouse_id,data.to_warehouse_id])];
      const warehouses=await client.query(`SELECT id,name,branch_id,type FROM warehouses WHERE company_id=$1 AND id=ANY($2::uuid[]) AND is_active FOR UPDATE`,[companyId,warehouseIds]);
      if(warehouses.rowCount!==warehouseIds.length) throw new NotFoundException('Selecciona bodegas activas de esta empresa.');
      const origin=warehouses.rows.find((w:any)=>w.id===data.from_warehouse_id);
      const destination=warehouses.rows.find((w:any)=>w.id===data.to_warehouse_id);
      if(origin.type!=='physical'||destination.type!=='physical') throw new BadRequestException('Las transferencias deben usar bodegas físicas.');
      const location=await client.query(`SELECT * FROM storage_locations WHERE id=$1 AND warehouse_id=$2 AND company_id=$3 AND status='active' FOR UPDATE`,[data.to_location_id,data.to_warehouse_id,companyId]);
      if(!location.rowCount) throw new BadRequestException('La ubicación destino no está activa o no pertenece a la bodega destino.');
      const combined=new Map<string,number>();
      for(const line of data.items) combined.set(line.inventory_id,(combined.get(line.inventory_id)||0)+line.quantity);
      const lines:any[]=[];
      for(const [inventoryId,quantity] of combined) {
        const stock=await client.query(`SELECT i.*,b.product_id,p.name product_name,p.sku,l.id source_location_id,l.code location_code,l.status location_status
          FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id
          JOIN storage_locations l ON l.id=i.storage_location_id JOIN warehouses w ON w.id=i.warehouse_id
          WHERE i.id=$1 AND w.company_id=$2 AND w.id=$3 AND i.stock_status='available' FOR UPDATE OF i`,[inventoryId,companyId,origin.id]);
        if(!stock.rowCount) throw new NotFoundException('Una línea de inventario ya no está disponible en la bodega de origen.');
        if(stock.rows[0].location_status!=='active') throw new ConflictException(`La ubicación ${stock.rows[0].location_code} está bloqueada.`);
        if(quantity>Number(stock.rows[0].quantity)) throw new ConflictException(`La transferencia supera el saldo disponible de ${stock.rows[0].product_name}.`);
        if(origin.id===destination.id&&stock.rows[0].source_location_id===location.rows[0].id) throw new BadRequestException('La ubicación de origen y destino deben ser diferentes.');
        lines.push({...stock.rows[0],requested_quantity:quantity});
      }
      const sequence=await client.query("SELECT nextval('inventory_transfer_number_seq') n");
      const number=`TRF-${new Date().getFullYear()}-${String(sequence.rows[0].n).padStart(6,'0')}`;
      const created=await client.query(`INSERT INTO inventory_transfers(company_id,transfer_number,from_warehouse_id,to_warehouse_id,to_location_id,status,reason,request_notes,requested_by)
        VALUES($1,$2,$3,$4,$5,'requested',$6,$7,$8) RETURNING *`,[companyId,number,origin.id,destination.id,location.rows[0].id,data.reason,data.notes||null,userId||null]);
      for(const line of lines) await client.query(`INSERT INTO inventory_transfer_items(transfer_id,product_id,batch_id,source_inventory_id,source_location_id,requested_quantity)
        VALUES($1,$2,$3,$4,$5,$6)`,[created.rows[0].id,line.product_id,line.batch_id,line.id,line.source_location_id,line.requested_quantity]);
      await this.event(client,created.rows[0].id,'requested',null,'requested',userId,{reason:data.reason,line_count:lines.length});
      await completeLogisticsRequest(client,companyId,'transfer.request',idempotencyKey,data,{id:created.rows[0].id,transfer_number:number,status:'requested'});
      await client.query('COMMIT');
      return {id:created.rows[0].id,transfer_number:number,status:'requested'};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async approve(companyId: string,userId: string,id: string,data: any) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const transfer=await client.query(`SELECT * FROM inventory_transfers WHERE id=$1 AND company_id=$2 AND status='requested' FOR UPDATE`,[id,companyId]);
      if(!transfer.rowCount) throw new ConflictException('Solo se pueden aprobar solicitudes pendientes.');
      const lines=await client.query('SELECT * FROM inventory_transfer_items WHERE transfer_id=$1 ORDER BY id FOR UPDATE',[id]);
      for(const line of lines.rows) {
        const stock=await client.query(`SELECT i.*,l.status location_status FROM inventory i JOIN storage_locations l ON l.id=i.storage_location_id
          WHERE i.id=$1 AND i.stock_status='available' FOR UPDATE OF i`,[line.source_inventory_id]);
        if(!stock.rowCount||Number(stock.rows[0].quantity)<Number(line.requested_quantity)||stock.rows[0].location_status!=='active') throw new ConflictException('El inventario de origen cambió o ya no alcanza; revisa las cantidades antes de aprobar.');
        await decrementInventory(client,line.source_inventory_id,Number(line.requested_quantity));
        const reserved=await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location)
          VALUES($1,$2,$3,'reserved',$4,$5) ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status)
          DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,[line.batch_id,stock.rows[0].warehouse_id,stock.rows[0].storage_location_id,line.requested_quantity,stock.rows[0].bin_location]);
        await client.query('UPDATE inventory_transfer_items SET reserved_inventory_id=$1 WHERE id=$2',[reserved.rows[0].id,line.id]);
        await this.movement(client,companyId,reserved.rows[0].id,line.batch_id,line.product_id,stock.rows[0].warehouse_id,line.source_location_id,line.source_location_id,'status_change',line.requested_quantity,'available','reserved',transfer.rows[0].transfer_number,'Reserva de transferencia aprobada',userId);
      }
      await client.query(`UPDATE inventory_transfers SET status='approved',approved_by=$1,approval_notes=$2,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$3`,[userId||null,data.notes||null,id]);
      await this.event(client,id,'approved','requested','approved',userId,{notes:data.notes||null});
      await client.query('COMMIT');
      return {success:true,status:'approved'};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async ship(companyId: string,userId: string,id: string,data: any,idempotencyKey?:string) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const payload={transfer_id:id,data};const cached=await claimLogisticsRequest(client,companyId,'transfer.ship',idempotencyKey,payload);if(cached){await client.query('COMMIT');return cached;}
      const transfer=await client.query(`SELECT t.*,w.name from_warehouse_name FROM inventory_transfers t JOIN warehouses w ON w.id=t.from_warehouse_id
        WHERE t.id=$1 AND t.company_id=$2 AND t.status IN ('approved','partially_shipped','partially_received') FOR UPDATE OF t`,[id,companyId]);
      if(!transfer.rowCount) throw new ConflictException('La transferencia debe estar aprobada y aún no recibida para despacharse.');
      const transit=await client.query(`SELECT * FROM storage_locations WHERE warehouse_id=$1 AND company_id=$2 AND code='TR-TRANSFER' AND status='active' FOR UPDATE`,[transfer.rows[0].from_warehouse_id,companyId]);
      if(!transit.rowCount) throw new ConflictException('La bodega de origen no tiene una ubicación de tránsito activa.');
      const combined=new Map<string,number>();
      for(const line of data.items) combined.set(line.transfer_item_id,(combined.get(line.transfer_item_id)||0)+line.quantity);
      const shipped:any[]=[];
      for(const [itemId,quantity] of combined) {
        const result=await client.query(`SELECT ti.*,p.name product_name,p.weight_kg,p.volume_m3,p.units_per_pallet FROM inventory_transfer_items ti
          JOIN products p ON p.id=ti.product_id WHERE ti.id=$1 AND ti.transfer_id=$2 FOR UPDATE OF ti`,[itemId,id]);
        if(!result.rowCount) throw new NotFoundException('Un artículo no pertenece a esta transferencia.');
        const line=result.rows[0];
        if(quantity>Number(line.requested_quantity)-Number(line.shipped_quantity)) throw new ConflictException(`La cantidad de ${line.product_name} supera lo pendiente de despacho.`);
        const reserved=await client.query(`SELECT i.*,l.warehouse_id FROM inventory i JOIN storage_locations l ON l.id=i.storage_location_id
          WHERE i.id=$1 AND i.stock_status='reserved' FOR UPDATE OF i`,[line.reserved_inventory_id]);
        if(!reserved.rowCount||quantity>Number(reserved.rows[0].quantity)) throw new ConflictException(`No hay reserva suficiente para ${line.product_name}.`);
        await this.ensureCapacity(client,transit.rows[0],line.batch_id,quantity);
        await decrementInventory(client,reserved.rows[0].id,quantity);
        const inTransit=await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location)
          VALUES($1,$2,$3,'reserved',$4,$5) ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status)
          DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,[line.batch_id,reserved.rows[0].warehouse_id,transit.rows[0].id,quantity,transit.rows[0].code]);
        await client.query('UPDATE inventory_transfer_items SET transit_inventory_id=$1,shipped_quantity=shipped_quantity+$2 WHERE id=$3',[inTransit.rows[0].id,quantity,itemId]);
        await this.movement(client,companyId,inTransit.rows[0].id,line.batch_id,line.product_id,reserved.rows[0].warehouse_id,line.source_location_id,transit.rows[0].id,'transfer',quantity,'reserved','reserved',transfer.rows[0].transfer_number,`Despacho a ${transfer.rows[0].to_warehouse_name}. ${data.notes||''}`.trim(),userId);
        shipped.push({transfer_item_id:itemId,quantity});
      }
      const totals=await client.query(`SELECT SUM(requested_quantity)::int requested,SUM(shipped_quantity)::int shipped,
        SUM(received_quantity+damaged_quantity+lost_quantity)::int resolved FROM inventory_transfer_items WHERE transfer_id=$1`,[id]);
      const summary=totals.rows[0];
      const status=Number(summary.shipped)>=Number(summary.requested)&&Number(summary.resolved)>=Number(summary.requested)?'received':Number(summary.resolved)>0?'partially_received':Number(summary.shipped)>=Number(summary.requested)?'in_transit':Number(summary.shipped)>0?'partially_shipped':'approved';
      await client.query('UPDATE inventory_transfers SET status=$1,shipped_by=$2,last_shipped_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$3',[status,userId||null,id]);
      await this.event(client,id,'shipped',transfer.rows[0].status,status,userId,{items:shipped,notes:data.notes||null});
      const response={success:true,status};await completeLogisticsRequest(client,companyId,'transfer.ship',idempotencyKey,payload,response);
      await client.query('COMMIT');
      return response;
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async receive(companyId: string,userId: string,id: string,data: any,idempotencyKey?:string) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const payload={transfer_id:id,data};const cached=await claimLogisticsRequest(client,companyId,'transfer.receive',idempotencyKey,payload);if(cached){await client.query('COMMIT');return cached;}
      const transfer=await client.query(`SELECT * FROM inventory_transfers WHERE id=$1 AND company_id=$2 AND status IN ('partially_shipped','in_transit','partially_received') FOR UPDATE`,[id,companyId]);
      if(!transfer.rowCount) throw new ConflictException('Esta transferencia no tiene mercancía pendiente de recepción.');
      const destination=transfer.rows[0];
      const target=await client.query(`SELECT * FROM storage_locations WHERE id=$1 AND warehouse_id=$2 AND company_id=$3 AND status='active' FOR UPDATE`,[destination.to_location_id,destination.to_warehouse_id,companyId]);
      const quarantine=await client.query(`SELECT * FROM storage_locations WHERE warehouse_id=$1 AND company_id=$2 AND code='QA-TRANSFER' AND status='active' FOR UPDATE`,[destination.to_warehouse_id,companyId]);
      if(!target.rowCount) throw new ConflictException('La ubicación de destino ya no está activa.');
      if(data.items.some((line:any)=>line.damaged_quantity>0)&&!quarantine.rowCount) throw new ConflictException('Falta una ubicación de cuarentena activa para registrar los daños.');
      const combined=new Map<string,any>();
      for(const line of data.items) {
        const current=combined.get(line.transfer_item_id)||{transfer_item_id:line.transfer_item_id,received_quantity:0,damaged_quantity:0,lost_quantity:0,notes:[]};
        current.received_quantity+=line.received_quantity;current.damaged_quantity+=line.damaged_quantity;current.lost_quantity+=line.lost_quantity;
        if(line.notes) current.notes.push(String(line.notes));
        combined.set(line.transfer_item_id,current);
      }
      const sequence=await client.query("SELECT nextval('inventory_transfer_receipt_number_seq') n");
      const receiptNumber=`REC-TR-${new Date().getFullYear()}-${String(sequence.rows[0].n).padStart(6,'0')}`;
      const receipt=await client.query(`INSERT INTO inventory_transfer_receipts(transfer_id,receipt_number,received_by,notes) VALUES($1,$2,$3,$4) RETURNING *`,[id,receiptNumber,userId||null,data.notes||null]);
      const eventItems:any[]=[];
      for(const [itemId,entry] of combined) {
        const result=await client.query(`SELECT ti.*,p.name product_name,p.weight_kg,p.volume_m3,p.units_per_pallet FROM inventory_transfer_items ti
          JOIN products p ON p.id=ti.product_id WHERE ti.id=$1 AND ti.transfer_id=$2 FOR UPDATE OF ti`,[itemId,id]);
        if(!result.rowCount) throw new NotFoundException('Un artículo no pertenece a esta transferencia.');
        const line=result.rows[0],total=entry.received_quantity+entry.damaged_quantity+entry.lost_quantity;
        const pending=Number(line.shipped_quantity)-Number(line.received_quantity)-Number(line.damaged_quantity)-Number(line.lost_quantity);
        if(total>pending) throw new ConflictException(`La recepción supera lo que sigue en tránsito de ${line.product_name}.`);
        const transit=await client.query('SELECT i.*,l.warehouse_id,l.id location_id FROM inventory i JOIN storage_locations l ON l.id=i.storage_location_id WHERE i.id=$1 AND i.stock_status=\'reserved\' FOR UPDATE OF i',[line.transit_inventory_id]);
        if(!transit.rowCount||total>Number(transit.rows[0].quantity)) throw new ConflictException(`El saldo en tránsito de ${line.product_name} no coincide.`);
        if(entry.received_quantity>0) {
          await this.ensureCapacity(client,target.rows[0],line.batch_id,entry.received_quantity);
          const stock=await this.upsertStock(client,line.batch_id,destination.to_warehouse_id,target.rows[0].id,'available',entry.received_quantity,target.rows[0].code);
          await this.movement(client,companyId,stock.id,line.batch_id,line.product_id,destination.to_warehouse_id,transit.rows[0].location_id,target.rows[0].id,'transfer',entry.received_quantity,'reserved','available',receiptNumber,'Recepción conforme de transferencia',userId);
        }
        if(entry.damaged_quantity>0) {
          const damageLocation=quarantine.rows[0];
          await this.ensureCapacity(client,damageLocation,line.batch_id,entry.damaged_quantity);
          const damaged=await this.upsertStock(client,line.batch_id,destination.to_warehouse_id,damageLocation.id,'damaged',entry.damaged_quantity,damageLocation.code);
          await this.movement(client,companyId,damaged.id,line.batch_id,line.product_id,destination.to_warehouse_id,transit.rows[0].location_id,damageLocation.id,'transfer',entry.damaged_quantity,'reserved','damaged',receiptNumber,'Mercancía dañada en tránsito; enviada a cuarentena',userId);
        }
        if(total>0) await decrementInventory(client,transit.rows[0].id,total);
        await client.query(`UPDATE inventory_transfer_items SET received_quantity=received_quantity+$1,damaged_quantity=damaged_quantity+$2,lost_quantity=lost_quantity+$3 WHERE id=$4`,[entry.received_quantity,entry.damaged_quantity,entry.lost_quantity,itemId]);
        if(entry.lost_quantity>0) await this.movement(client,companyId,transit.rows[0].id,line.batch_id,line.product_id,transit.rows[0].warehouse_id,transit.rows[0].location_id,null,'transfer',entry.lost_quantity,'reserved',null,receiptNumber,'Mercancía reportada como perdida en tránsito',userId);
        await client.query(`INSERT INTO inventory_transfer_receipt_items(receipt_id,transfer_item_id,received_quantity,damaged_quantity,lost_quantity,notes)
          VALUES($1,$2,$3,$4,$5,$6)`,[receipt.rows[0].id,itemId,entry.received_quantity,entry.damaged_quantity,entry.lost_quantity,entry.notes.join(' · ')||null]);
        eventItems.push({transfer_item_id:itemId,received_quantity:entry.received_quantity,damaged_quantity:entry.damaged_quantity,lost_quantity:entry.lost_quantity});
      }
      const totals=await client.query(`SELECT SUM(requested_quantity)::int requested,SUM(shipped_quantity)::int shipped,
        SUM(received_quantity+damaged_quantity+lost_quantity)::int resolved FROM inventory_transfer_items WHERE transfer_id=$1`,[id]);
      const sum=totals.rows[0];
      const status=Number(sum.shipped)>=Number(sum.requested)&&Number(sum.resolved)>=Number(sum.requested)?'received':Number(sum.resolved)>0?'partially_received':Number(sum.shipped)>=Number(sum.requested)?'in_transit':'partially_shipped';
      await client.query(`UPDATE inventory_transfers SET status=$1,last_received_by=$2,completed_at=CASE WHEN $1='received' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=$3`,[status,userId||null,id]);
      await this.event(client,id,'received',destination.status,status,userId,{receipt_number:receiptNumber,items:eventItems,notes:data.notes||null});
      const response={success:true,receipt_number:receiptNumber,status};await completeLogisticsRequest(client,companyId,'transfer.receive',idempotencyKey,payload,response);
      await client.query('COMMIT');
      return response;
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async cancel(companyId: string,userId: string,id: string,data: any) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const transfer=await client.query(`SELECT * FROM inventory_transfers WHERE id=$1 AND company_id=$2 AND status IN ('requested','approved') FOR UPDATE`,[id,companyId]);
      if(!transfer.rowCount) throw new ConflictException('La transferencia ya fue despachada o no se puede cancelar.');
      const lines=await client.query('SELECT * FROM inventory_transfer_items WHERE transfer_id=$1 ORDER BY id FOR UPDATE',[id]);
      for(const line of lines.rows) {
        if(Number(line.shipped_quantity)>0) throw new ConflictException('No se puede cancelar una transferencia que ya salió de origen.');
        if(transfer.rows[0].status==='approved') {
          const reserved=await client.query(`SELECT i.*,l.warehouse_id FROM inventory i JOIN storage_locations l ON l.id=i.storage_location_id WHERE i.id=$1 AND i.stock_status='reserved' FOR UPDATE OF i`,[line.reserved_inventory_id]);
          if(!reserved.rowCount||Number(reserved.rows[0].quantity)<Number(line.requested_quantity)) throw new ConflictException('No se pudo verificar la reserva; solicita revisión antes de cancelar.');
          await decrementInventory(client,reserved.rows[0].id,Number(line.requested_quantity));
          const available=await this.upsertStock(client,line.batch_id,reserved.rows[0].warehouse_id,line.source_location_id,'available',line.requested_quantity,reserved.rows[0].bin_location);
          await this.movement(client,companyId,available.id,line.batch_id,line.product_id,reserved.rows[0].warehouse_id,line.source_location_id,line.source_location_id,'status_change',line.requested_quantity,'reserved','available',transfer.rows[0].transfer_number,`Reserva liberada. ${data.reason||''}`.trim(),userId);
        }
      }
      await client.query(`UPDATE inventory_transfers SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[id]);
      await this.event(client,id,'cancelled',transfer.rows[0].status,'cancelled',userId,{reason:data.reason||null});
      await client.query('COMMIT');
      return {success:true,status:'cancelled'};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async upsertStock(client:any,batchId:string,warehouseId:string,locationId:string,status:string,quantity:number,bin:string) {
    const result=await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status)
      DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,[batchId,warehouseId,locationId,status,quantity,bin]);
    return result.rows[0];
  }

  private async ensureCapacity(client:any,location:any,batchId:string,quantity:number) {
    const row=await client.query(`SELECT COALESCE(SUM(i.quantity),0) units,COALESCE(SUM(i.quantity*p.weight_kg),0) weight,
      COALESCE(SUM(i.quantity*p.volume_m3),0) volume,COALESCE(SUM(i.quantity/p.units_per_pallet),0) pallets
      FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id WHERE i.storage_location_id=$1`,[location.id]);
    const item=await client.query(`SELECT p.weight_kg,p.volume_m3,p.units_per_pallet FROM product_batches b JOIN products p ON p.id=b.product_id WHERE b.id=$1`,[batchId]);
    const current=row.rows[0],product=item.rows[0];
    if(location.capacity_units>0&&Number(current.units)+quantity>Number(location.capacity_units)) throw new ConflictException(`La ubicación ${location.code} no tiene capacidad suficiente en unidades.`);
    if(location.capacity_weight_kg>0&&Number(current.weight)+quantity*Number(product.weight_kg)>Number(location.capacity_weight_kg)) throw new ConflictException(`La ubicación ${location.code} superaría su capacidad en peso.`);
    if(location.capacity_volume_m3>0&&Number(current.volume)+quantity*Number(product.volume_m3)>Number(location.capacity_volume_m3)) throw new ConflictException(`La ubicación ${location.code} superaría su capacidad en volumen.`);
    if(location.capacity_pallets>0&&Number(current.pallets)+quantity/Number(product.units_per_pallet)>Number(location.capacity_pallets)) throw new ConflictException(`La ubicación ${location.code} superaría su capacidad de pallets.`);
  }

  private async movement(client:any,companyId:string,inventoryId:string,batchId:string,productId:string,warehouseId:string,fromId:string|null,toId:string|null,type:string,quantity:number,fromStatus:string|null,toStatus:string|null,reference:string,notes:string,userId:string) {
    await client.query(`INSERT INTO storage_movements(company_id,inventory_id,batch_id,product_id,warehouse_id,from_location_id,to_location_id,movement_type,quantity,from_status,to_status,reference,notes,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[companyId,inventoryId,batchId,productId,warehouseId,fromId,toId,type,quantity,fromStatus,toStatus,reference,notes,userId||null]);
  }

  private async event(client:any,transferId:string,type:string,fromStatus:string|null,toStatus:string,userId:string,details:any) {
    await client.query(`INSERT INTO inventory_transfer_events(transfer_id,event_type,from_status,to_status,notes,details,created_by)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,[transferId,type,fromStatus,toStatus,details.notes||details.reason||null,JSON.stringify(details),userId||null]);
  }
}
