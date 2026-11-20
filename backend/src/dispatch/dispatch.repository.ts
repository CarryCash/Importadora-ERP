import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { claimLogisticsRequest, completeLogisticsRequest, decrementInventory } from '../common/logistics-idempotency';

const checklistDefaults = [
  ['items_verified','Artículos y cantidades verificados'],
  ['packaging_checked','Empaque e integridad revisados'],
  ['labels_applied','Etiquetas logísticas colocadas'],
  ['documents_checked','Documentos de salida revisados'],
  ['vehicle_checked','Vehículo y transportista validados'],
  ['goods_condition','Mercancía en buen estado antes de salida'],
];

@Injectable()
export class DispatchRepository {
  constructor(private readonly db: DatabaseService) {}

  async sales(companyId:string) {
    return (await this.db.query(`SELECT s.id AS sale_id,s.sale_number,s.sale_date,s.total_amount,s.payment_status,
      COALESCE(c.name,'Venta de mostrador') AS customer_name,COUNT(si.id)::int AS line_count,
      COALESCE(SUM(si.quantity),0)::int AS unit_count
      FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN sales_items si ON si.sale_id=s.id
      WHERE s.company_id=$1 AND s.status='completed' AND NOT EXISTS(SELECT 1 FROM fulfillment_orders f WHERE f.sale_id=s.id AND f.company_id=$1)
      GROUP BY s.id,c.name ORDER BY s.sale_date DESC,s.created_at DESC LIMIT 200`,[companyId])).rows;
  }

  async orders(companyId:string,status?:string) {
    const params:any[]=[companyId];
    const statusFilter=status&&status!=='all'?`AND f.status=$${params.push(status)}`:'';
    return (await this.db.query(`SELECT f.*,s.sale_number,s.sale_date,s.payment_status,s.total_amount,
      COALESCE(c.name,'Venta de mostrador') customer_name,
      COUNT(fi.id)::int line_count,COALESCE(SUM(fi.ordered_quantity),0)::int unit_count,
      COALESCE(SUM(fi.picked_quantity),0)::int picked_units,COALESCE(SUM(fi.packed_quantity),0)::int packed_units,
      COALESCE(SUM(fi.dispatched_quantity),0)::int dispatched_units,
      (SELECT COUNT(*)::int FROM fulfillment_packages fp WHERE fp.fulfillment_order_id=f.id) package_count
      FROM fulfillment_orders f JOIN sales s ON s.id=f.sale_id LEFT JOIN customers c ON c.id=s.customer_id
      LEFT JOIN fulfillment_items fi ON fi.fulfillment_order_id=f.id
      WHERE f.company_id=$1 ${statusFilter} GROUP BY f.id,s.sale_number,s.sale_date,s.payment_status,s.total_amount,c.name
      ORDER BY CASE f.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,f.created_at`,params)).rows;
  }

  async order(companyId:string,id:string) {
    const header=await this.db.query(`SELECT f.*,s.sale_number,s.sale_date,s.payment_status,s.total_amount,s.discount,s.tax,
      COALESCE(c.name,'Venta de mostrador') customer_name,c.phone customer_phone,u.full_name AS assigned_name
      FROM fulfillment_orders f JOIN sales s ON s.id=f.sale_id LEFT JOIN customers c ON c.id=s.customer_id
      LEFT JOIN users u ON u.id=f.assigned_to WHERE f.company_id=$1 AND f.id=$2`,[companyId,id]);
    if(!header.rowCount) throw new NotFoundException('Pedido de preparación no encontrado.');
    const [items,packages,checklist,events,evidence]=await Promise.all([
      this.db.query(`SELECT fi.*,p.name product_name,p.sku,p.barcode,p.weight_kg,p.volume_m3,b.batch_number,b.expiration_date,
        src.code source_location,src.zone source_zone,src.aisle source_aisle,staged.code dispatch_location,
        GREATEST(0,fi.picked_quantity-fi.packed_quantity) unpacked_quantity,
        GREATEST(0,fi.packed_quantity-fi.dispatched_quantity) ready_to_dispatch
        FROM fulfillment_items fi JOIN products p ON p.id=fi.product_id JOIN product_batches b ON b.id=fi.batch_id
        JOIN inventory ri ON ri.id=fi.reserved_inventory_id JOIN storage_locations src ON src.id=ri.storage_location_id
        LEFT JOIN LATERAL(SELECT sl.code FROM fulfillment_picks fp JOIN inventory pi ON pi.id=fp.inventory_id JOIN storage_locations sl ON sl.id=pi.storage_location_id
          JOIN fulfillment_wave_items wi ON wi.id=fp.wave_item_id WHERE wi.fulfillment_item_id=fi.id ORDER BY fp.picked_at DESC LIMIT 1) staged ON true
        WHERE fi.fulfillment_order_id=$1 ORDER BY b.expiration_date NULLS LAST,p.name`,[id]),
      this.db.query(`SELECT * FROM fulfillment_packages WHERE fulfillment_order_id=$1 ORDER BY created_at`,[id]),
      this.db.query(`SELECT * FROM fulfillment_checklist WHERE fulfillment_order_id=$1 ORDER BY check_key`,[id]),
      this.db.query(`SELECT de.*,u.full_name dispatched_by_name FROM dispatch_events de LEFT JOIN users u ON u.id=de.dispatched_by WHERE de.fulfillment_order_id=$1 ORDER BY de.dispatched_at DESC`,[id]),
      this.db.query(`SELECT * FROM fulfillment_evidence WHERE fulfillment_order_id=$1 ORDER BY created_at DESC`,[id]),
    ]);
    const eventItems=await this.db.query(`SELECT dei.*,p.name product_name,fe.batch_id FROM dispatch_event_items dei
      JOIN fulfillment_items fe ON fe.id=dei.fulfillment_item_id JOIN products p ON p.id=fe.product_id
      WHERE dei.dispatch_event_id=ANY($1::uuid[])`,[events.rows.map((event:any)=>event.id)]);
    const eventsWithItems=events.rows.map((event:any)=>({...event,items:eventItems.rows.filter((item:any)=>item.dispatch_event_id===event.id)}));
    const packageItems=packages.rows.length?await this.db.query(`SELECT pi.*,fi.product_id,p.name product_name FROM fulfillment_package_items pi
      JOIN fulfillment_items fi ON fi.id=pi.fulfillment_item_id JOIN products p ON p.id=fi.product_id WHERE pi.package_id=ANY($1::uuid[])`,[packages.rows.map((pkg:any)=>pkg.id)]):{rows:[]};
    const packagesWithItems=packages.rows.map((pkg:any)=>({...pkg,items:packageItems.rows.filter((item:any)=>item.package_id===pkg.id)}));
    return {...header.rows[0],items:items.rows,packages:packagesWithItems,checklist:checklist.rows,dispatch_events:eventsWithItems,evidence:evidence.rows};
  }

  async createOrder(companyId:string,userId:string,data:any) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const sale=await client.query(`SELECT s.*,COALESCE(c.name,'Venta de mostrador') customer_name,c.phone customer_phone,c.address customer_address,c.city customer_city
        FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=$1 AND s.company_id=$2 AND s.status='completed' FOR UPDATE OF s`,[data.sale_id,companyId]);
      if(!sale.rowCount) throw new NotFoundException('La venta no existe, no pertenece a esta empresa o no está completada.');
      if(!sale.rows[0].customer_name) throw new BadRequestException('No se puede preparar una venta sin destinatario.');
      const lines=await client.query(`SELECT si.id sale_item_id,si.batch_id,si.inventory_id,si.storage_location_id,si.quantity,b.product_id,p.name product_name
        FROM sales_items si JOIN product_batches b ON b.id=si.batch_id JOIN products p ON p.id=b.product_id
        WHERE si.sale_id=$1 ORDER BY b.expiration_date NULLS LAST,si.created_at`,[data.sale_id]);
      if(!lines.rowCount) throw new BadRequestException('La venta no tiene artículos para preparar.');
      const existing=await client.query('SELECT id FROM fulfillment_orders WHERE company_id=$1 AND sale_id=$2',[companyId,data.sale_id]);
      if(existing.rowCount) throw new ConflictException('Esta venta ya tiene un pedido de preparación.');
      const seq=await client.query("SELECT nextval('fulfillment_number_seq') n");
      const fulfillmentNumber=`PRE-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(6,'0')}`;
      const created=await client.query(`INSERT INTO fulfillment_orders(company_id,sale_id,fulfillment_number,status,picking_strategy,priority,
        recipient_name,shipping_address,shipping_city,shipping_phone,notes,created_by)
        VALUES($1,$2,$3,'ready',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[
        companyId,data.sale_id,fulfillmentNumber,data.picking_strategy||'fefo',data.priority||'normal',
        data.recipient_name||sale.rows[0].customer_name,data.shipping_address||sale.rows[0].customer_address||null,
        data.shipping_city||sale.rows[0].customer_city||null,data.shipping_phone||sale.rows[0].customer_phone||null,data.notes||null,userId||null,
      ]);
      const order=created.rows[0];
      for(const line of lines.rows) {
        if(!line.inventory_id||!line.storage_location_id) throw new ConflictException(`La venta no conserva la ubicación de origen de ${line.product_name}; revisa la migración de inventario.`);
        const source=await client.query(`SELECT i.*,l.code location_code,l.status location_status,w.id warehouse_id FROM inventory i
          JOIN storage_locations l ON l.id=i.storage_location_id JOIN warehouses w ON w.id=i.warehouse_id
          WHERE i.id=$1 AND i.warehouse_id=l.warehouse_id AND w.company_id=$2 FOR UPDATE OF i`,[line.inventory_id,companyId]);
        if(!source.rowCount) throw new ConflictException(`No se pudo verificar el origen de ${line.product_name}.`);
        if(source.rows[0].location_status!=='active') throw new ConflictException(`La ubicación ${source.rows[0].location_code} está bloqueada; no se puede reservar el artículo.`);
        const reserved=await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location)
          VALUES($1,$2,$3,'reserved',$4,$5) ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status)
          DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,
          [line.batch_id,source.rows[0].warehouse_id,line.storage_location_id,line.quantity,source.rows[0].bin_location||source.rows[0].location_code]);
        const fulfillmentItem=await client.query(`INSERT INTO fulfillment_items(fulfillment_order_id,sale_item_id,product_id,batch_id,source_inventory_id,reserved_inventory_id,ordered_quantity)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[order.id,line.sale_item_id,line.product_id,line.batch_id,line.inventory_id,reserved.rows[0].id,line.quantity]);
        await client.query(`INSERT INTO stock_movements(inventory_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by)
          VALUES($1,$2,'adjustment',$3,$4,$5,$6)`,[reserved.rows[0].id,line.batch_id,line.quantity,data.sale_id,`Reserva para preparación ${fulfillmentNumber}`,userId||null]);
        await client.query(`INSERT INTO storage_movements(company_id,inventory_id,batch_id,product_id,warehouse_id,from_location_id,to_location_id,movement_type,quantity,from_status,to_status,reference,notes,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$6,'status_change',$7,'available','reserved',$8,$9,$10)`,
          [companyId,reserved.rows[0].id,line.batch_id,line.product_id,source.rows[0].warehouse_id,line.storage_location_id,line.quantity,fulfillmentNumber,'Reserva para preparación desde venta',userId||null]);
        void fulfillmentItem;
      }
      for(const [key,label] of checklistDefaults) await client.query('INSERT INTO fulfillment_checklist(fulfillment_order_id,check_key,label) VALUES($1,$2,$3)',[order.id,key,label]);
      await client.query('COMMIT');
      return {id:order.id,fulfillment_number:order.fulfillment_number,status:order.status};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async waves(companyId:string) {
    return (await this.db.query(`SELECT w.*,u.full_name assigned_name,COUNT(DISTINCT wo.fulfillment_order_id)::int order_count,
      COALESCE(SUM(wi.quantity),0)::int unit_count,COALESCE(SUM(wi.picked_quantity),0)::int picked_units
      FROM fulfillment_waves w LEFT JOIN users u ON u.id=w.assigned_to LEFT JOIN fulfillment_wave_orders wo ON wo.wave_id=w.id
      LEFT JOIN fulfillment_wave_items wi ON wi.wave_id=w.id WHERE w.company_id=$1 GROUP BY w.id,u.full_name ORDER BY w.created_at DESC LIMIT 100`,[companyId])).rows;
  }

  async createWave(companyId:string,userId:string,data:any) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const ids=[...new Set(data.order_ids as string[])];
      const selected=await client.query(`SELECT * FROM fulfillment_orders WHERE company_id=$1 AND id=ANY($2::uuid[]) AND status IN ('ready','picking') FOR UPDATE`,[companyId,ids]);
      if(selected.rowCount!==ids.length) throw new ConflictException('Alguno de los pedidos seleccionados no está disponible para picking.');
      const active=await client.query(`SELECT 1 FROM fulfillment_wave_orders wo JOIN fulfillment_waves w ON w.id=wo.wave_id
        WHERE wo.fulfillment_order_id=ANY($1::uuid[]) AND w.status IN ('open','picking') LIMIT 1`,[ids]);
      if(active.rowCount) throw new ConflictException('Uno de los pedidos ya está en una ola abierta.');
      const seq=await client.query("SELECT nextval('fulfillment_wave_number_seq') n");
      const waveNumber=`OLA-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(5,'0')}`;
      const wave=await client.query(`INSERT INTO fulfillment_waves(company_id,wave_number,status,picking_strategy,assigned_to,created_by)
        VALUES($1,$2,'open',$3,$4,$5) RETURNING *`,[companyId,waveNumber,data.picking_strategy||'fefo',data.assigned_to||null,userId||null]);
      for(const order of selected.rows) {
        await client.query('INSERT INTO fulfillment_wave_orders(wave_id,fulfillment_order_id) VALUES($1,$2)',[wave.rows[0].id,order.id]);
        const outstanding=await client.query(`SELECT id,ordered_quantity-picked_quantity AS quantity FROM fulfillment_items
          WHERE fulfillment_order_id=$1 AND ordered_quantity>picked_quantity`,[order.id]);
        for(const item of outstanding.rows) await client.query('INSERT INTO fulfillment_wave_items(wave_id,fulfillment_item_id,quantity) VALUES($1,$2,$3)',[wave.rows[0].id,item.id,item.quantity]);
        await client.query("UPDATE fulfillment_orders SET status='picking',assigned_to=COALESCE($1,assigned_to),updated_at=CURRENT_TIMESTAMP WHERE id=$2",[data.assigned_to||null,order.id]);
      }
      await client.query('COMMIT');
      return wave.rows[0];
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async wave(companyId:string,id:string) {
    const header=await this.db.query('SELECT * FROM fulfillment_waves WHERE id=$1 AND company_id=$2',[id,companyId]);
    if(!header.rowCount) throw new NotFoundException('Ola de preparación no encontrada.');
    const items=await this.db.query(`SELECT wi.id wave_item_id,wi.quantity,wi.picked_quantity,
      fi.id fulfillment_item_id,fi.ordered_quantity,fi.picked_quantity item_picked,fi.batch_id,
      p.name product_name,p.sku,p.barcode,b.batch_number,b.expiration_date,
      f.id fulfillment_order_id,f.fulfillment_number,s.sale_number,COALESCE(c.name,'Venta de mostrador') customer_name,
      sl.code location_code,sl.zone,sl.aisle,sl.rack,sl.level
      FROM fulfillment_wave_items wi JOIN fulfillment_items fi ON fi.id=wi.fulfillment_item_id
      JOIN fulfillment_orders f ON f.id=fi.fulfillment_order_id JOIN sales s ON s.id=f.sale_id
      LEFT JOIN customers c ON c.id=s.customer_id JOIN products p ON p.id=fi.product_id JOIN product_batches b ON b.id=fi.batch_id
      JOIN inventory ri ON ri.id=fi.reserved_inventory_id JOIN storage_locations sl ON sl.id=ri.storage_location_id
      WHERE wi.wave_id=$1 ORDER BY CASE WHEN $2='fefo' THEN b.expiration_date END ASC NULLS LAST,
        CASE WHEN $2='fifo' THEN b.created_at END ASC,sl.zone,sl.aisle,sl.rack,sl.level,p.name`,[id,header.rows[0].picking_strategy]);
    return {...header.rows[0],items:items.rows};
  }

  async pick(companyId:string,userId:string,waveId:string,data:any) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const line=await client.query(`SELECT wi.*,fi.id fulfillment_item_id,fi.fulfillment_order_id,fi.batch_id,fi.product_id,fi.reserved_inventory_id,
        fi.ordered_quantity,fi.picked_quantity item_picked,f.fulfillment_number,f.company_id,p.sku,p.barcode,p.weight_kg,p.volume_m3,p.units_per_pallet,
        ri.warehouse_id,ri.storage_location_id source_location_id,ri.stock_status source_status,ri.quantity source_quantity,
        b.product_id batch_product_id,b.batch_number
        FROM fulfillment_wave_items wi JOIN fulfillment_items fi ON fi.id=wi.fulfillment_item_id
        JOIN fulfillment_orders f ON f.id=fi.fulfillment_order_id JOIN inventory ri ON ri.id=fi.reserved_inventory_id
        JOIN products p ON p.id=fi.product_id JOIN product_batches b ON b.id=fi.batch_id
        WHERE wi.id=$1 AND wi.wave_id=$2 AND f.company_id=$3 FOR UPDATE OF wi,fi,ri`,[data.wave_item_id,waveId,companyId]);
      if(!line.rowCount) throw new NotFoundException('Línea de picking no encontrada.');
      const item=line.rows[0];
      if(data.quantity>Number(item.quantity)-Number(item.picked_quantity)) throw new BadRequestException('La cantidad supera lo pendiente en esta línea de ola.');
      if(data.quantity>Number(item.source_quantity)) throw new ConflictException('La reserva ya no tiene suficiente cantidad en la ubicación de origen.');
      if(item.barcode&&String(data.barcode||'').trim().toLowerCase()!==String(item.barcode).trim().toLowerCase()&&String(data.barcode||'').trim().toLowerCase()!==String(item.sku).trim().toLowerCase()) throw new BadRequestException('El código leído no corresponde al producto esperado.');
      const stage=await client.query(`SELECT * FROM storage_locations WHERE warehouse_id=$1 AND company_id=$2 AND location_type='dispatch' AND status='active'
        ORDER BY CASE WHEN code='DESPACHO' THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE`,[item.warehouse_id,companyId]);
      if(!stage.rowCount) throw new ConflictException('La bodega no tiene una zona de despacho activa.');
      const capacity=await client.query(`SELECT COALESCE(SUM(i.quantity),0) units,COALESCE(SUM(i.quantity*p.weight_kg),0) weight,
        COALESCE(SUM(i.quantity*p.volume_m3),0) volume,COALESCE(SUM(i.quantity/p.units_per_pallet),0) pallets
        FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id WHERE i.storage_location_id=$1`,[stage.rows[0].id]);
      const occupied=capacity.rows[0],location=stage.rows[0];
      if(location.capacity_units>0&&Number(occupied.units)+data.quantity>Number(location.capacity_units)) throw new ConflictException('La zona de despacho no tiene espacio suficiente en unidades.');
      if(location.capacity_weight_kg>0&&Number(occupied.weight)+data.quantity*Number(item.weight_kg)>Number(location.capacity_weight_kg)) throw new ConflictException('La zona de despacho superaría su capacidad de peso.');
      if(location.capacity_volume_m3>0&&Number(occupied.volume)+data.quantity*Number(item.volume_m3)>Number(location.capacity_volume_m3)) throw new ConflictException('La zona de despacho superaría su capacidad de volumen.');
      if(location.capacity_pallets>0&&Number(occupied.pallets)+data.quantity/Number(item.units_per_pallet)>Number(location.capacity_pallets)) throw new ConflictException('La zona de despacho superaría su capacidad de pallets.');
      await decrementInventory(client,item.reserved_inventory_id,data.quantity);
      const staged=await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location)
        VALUES($1,$2,$3,'reserved',$4,$5) ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status)
        DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,[item.batch_id,item.warehouse_id,location.id,data.quantity,location.code]);
      await client.query(`WITH picked AS (SELECT id FROM inventory_unit_serials WHERE company_id=$1 AND batch_id=$2 AND inventory_id=$3 AND status='in_stock' ORDER BY created_at,id LIMIT $4 FOR UPDATE)
        UPDATE inventory_unit_serials us SET inventory_id=$5,status='reserved',updated_at=CURRENT_TIMESTAMP FROM picked WHERE us.id=picked.id`,[companyId,item.batch_id,item.reserved_inventory_id,data.quantity,staged.rows[0].id]);
      await client.query(`INSERT INTO fulfillment_picks(wave_item_id,inventory_id,quantity,verified_barcode,picked_by) VALUES($1,$2,$3,$4,$5)`,[data.wave_item_id,staged.rows[0].id,data.quantity,data.barcode||item.barcode||item.sku,userId||null]);
      await client.query(`INSERT INTO storage_movements(company_id,inventory_id,batch_id,product_id,warehouse_id,from_location_id,to_location_id,movement_type,quantity,from_status,to_status,reference,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,'relocation',$8,'reserved','reserved',$9,$10,$11)`,[companyId,staged.rows[0].id,item.batch_id,item.product_id,item.warehouse_id,item.source_location_id,location.id,item.quantity?data.quantity:data.quantity,item.fulfillment_number,'Picking verificado y llevado a zona de despacho',userId||null]);
      await client.query('UPDATE fulfillment_wave_items SET picked_quantity=picked_quantity+$1 WHERE id=$2',[data.quantity,data.wave_item_id]);
      await client.query('UPDATE fulfillment_items SET picked_quantity=picked_quantity+$1 WHERE id=$2',[data.quantity,item.fulfillment_item_id]);
      await client.query(`UPDATE fulfillment_orders f SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM fulfillment_items x WHERE x.fulfillment_order_id=f.id AND x.picked_quantity<x.ordered_quantity) THEN 'picked' ELSE 'picking' END,updated_at=CURRENT_TIMESTAMP WHERE f.id=$1`,[item.fulfillment_order_id]);
      await client.query(`UPDATE fulfillment_waves SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM fulfillment_wave_items x WHERE x.wave_id=$1 AND x.picked_quantity<x.quantity) THEN 'completed' ELSE 'picking' END,
        completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM fulfillment_wave_items x WHERE x.wave_id=$1 AND x.picked_quantity<x.quantity) THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1`,[waveId]);
      await client.query('COMMIT');
      return {success:true,staging_inventory_id:staged.rows[0].id};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async createPackage(companyId:string,userId:string,orderId:string,data:any) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const order=await client.query(`SELECT * FROM fulfillment_orders WHERE id=$1 AND company_id=$2 AND status NOT IN ('cancelled','dispatched') FOR UPDATE`,[orderId,companyId]);
      if(!order.rowCount) throw new NotFoundException('Pedido no encontrado o ya despachado.');
      const packageSeq=await client.query('SELECT COUNT(*)::int n FROM fulfillment_packages WHERE fulfillment_order_id=$1',[orderId]);
      const packageNumber=String(packageSeq.rows[0].n+1).padStart(3,'0');
      const labelCode=`${order.rows[0].fulfillment_number}-P${packageNumber}`;
      const pkg=await client.query(`INSERT INTO fulfillment_packages(fulfillment_order_id,package_number,package_type,weight_kg,volume_m3,label_code)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[orderId,packageNumber,data.package_type,Number(data.weight_kg||0),Number(data.volume_m3||0),labelCode]);
      const combined=new Map<string,number>();
      for(const row of data.items) {
        const qty=Number(row.quantity);
        if(!row.fulfillment_item_id||!Number.isInteger(qty)||qty<=0) throw new BadRequestException('Cada contenido del paquete requiere un artículo y cantidad entera mayor que cero.');
        combined.set(row.fulfillment_item_id,(combined.get(row.fulfillment_item_id)||0)+qty);
      }
      for(const [itemId,qty] of combined) {
        const item=await client.query('SELECT * FROM fulfillment_items WHERE id=$1 AND fulfillment_order_id=$2 FOR UPDATE',[itemId,orderId]);
        if(!item.rowCount) throw new NotFoundException('Un artículo indicado no pertenece a este pedido.');
        if(qty>Number(item.rows[0].picked_quantity)-Number(item.rows[0].packed_quantity)) throw new BadRequestException('No puedes empacar más unidades de las que se han recogido y verificado.');
        await client.query('INSERT INTO fulfillment_package_items(package_id,fulfillment_item_id,quantity) VALUES($1,$2,$3)',[pkg.rows[0].id,itemId,qty]);
        await client.query('UPDATE fulfillment_items SET packed_quantity=packed_quantity+$1 WHERE id=$2',[qty,itemId]);
      }
      await client.query(`UPDATE fulfillment_orders f SET status=CASE WHEN f.status='partially_dispatched' THEN f.status
        WHEN NOT EXISTS(SELECT 1 FROM fulfillment_items x WHERE x.fulfillment_order_id=f.id AND x.packed_quantity<x.picked_quantity) THEN 'packed' ELSE f.status END,
        packed_by=$1,packed_at=COALESCE(packed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE f.id=$2`,[userId||null,orderId]);
      await client.query('COMMIT');
      return pkg.rows[0];
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async updateChecklist(companyId:string,userId:string,orderId:string,key:string,isComplete:boolean) {
    const updated=await this.db.query(`UPDATE fulfillment_checklist fc SET is_complete=$4,completed_by=CASE WHEN $4 THEN $5 ELSE NULL END,
      completed_at=CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END FROM fulfillment_orders f
      WHERE fc.fulfillment_order_id=f.id AND f.company_id=$1 AND f.id=$2 AND fc.check_key=$3 RETURNING fc.*`,[companyId,orderId,key,isComplete,userId||null]);
    if(!updated.rowCount) throw new NotFoundException('Control de despacho no encontrado.');
    return updated.rows[0];
  }

  async addEvidence(companyId:string,userId:string,orderId:string,data:any) {
    const result=await this.db.query(`INSERT INTO fulfillment_evidence(fulfillment_order_id,evidence_type,file_name,file_url,notes,created_by)
      SELECT f.id,$3,$4,$5,$6,$7 FROM fulfillment_orders f WHERE f.id=$1 AND f.company_id=$2 RETURNING *`,
      [orderId,companyId,data.evidence_type,String(data.file_name).trim(),data.file_url||null,data.notes||null,userId||null]);
    if(!result.rowCount) throw new NotFoundException('Pedido de preparación no encontrado.');
    return result.rows[0];
  }

  async dispatch(companyId:string,userId:string,orderId:string,data:any,idempotencyKey?:string) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const payload={order_id:orderId,data};const cached=await claimLogisticsRequest(client,companyId,'dispatch.confirm',idempotencyKey,payload);if(cached){await client.query('COMMIT');return cached;}
      const order=await client.query(`SELECT * FROM fulfillment_orders WHERE id=$1 AND company_id=$2 AND status NOT IN ('cancelled','dispatched') FOR UPDATE`,[orderId,companyId]);
      if(!order.rowCount) throw new NotFoundException('Pedido no encontrado o ya despachado.');
      const missing=await client.query('SELECT label FROM fulfillment_checklist WHERE fulfillment_order_id=$1 AND is_required AND NOT is_complete',[orderId]);
      if(missing.rowCount) throw new ConflictException(`Completa antes de salir: ${missing.rows.map((r:any)=>r.label).join(', ')}.`);
      const seq=await client.query("SELECT nextval('dispatch_number_seq') n");
      const dispatchNumber=`DSP-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(6,'0')}`;
      const event=await client.query(`INSERT INTO dispatch_events(fulfillment_order_id,dispatch_number,carrier_name,driver_name,vehicle_plate,tracking_number,document_reference,notes,dispatched_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[orderId,dispatchNumber,data.carrier_name||null,data.driver_name||null,data.vehicle_plate||null,data.tracking_number||null,data.document_reference||null,data.notes||null,userId||null]);
      const combined=new Map<string,number>();
      for(const row of data.items) combined.set(row.fulfillment_item_id,(combined.get(row.fulfillment_item_id)||0)+Number(row.quantity));
      for(const [itemId,qty] of combined) {
        if(!Number.isInteger(qty)||qty<=0) throw new BadRequestException('La cantidad despachada debe ser entera y mayor que cero.');
        const item=await client.query(`SELECT * FROM fulfillment_items WHERE id=$1 AND fulfillment_order_id=$2 FOR UPDATE`,[itemId,orderId]);
        if(!item.rowCount) throw new NotFoundException('Un artículo indicado no pertenece a este pedido.');
        const row=item.rows[0];
        if(qty>Number(row.packed_quantity)-Number(row.dispatched_quantity)) throw new ConflictException('La cantidad supera lo empacado que aún no se ha despachado.');
        const packageRemaining=await client.query(`SELECT COALESCE(SUM(quantity-dispatched_quantity),0) remaining FROM fulfillment_package_items WHERE fulfillment_item_id=$1`,[itemId]);
        if(qty>Number(packageRemaining.rows[0].remaining)) throw new ConflictException('No hay suficientes unidades asociadas a etiquetas de paquete para esta salida.');
        const picks=await client.query(`SELECT i.id inventory_id,i.quantity,i.batch_id,i.storage_location_id,sl.warehouse_id
          FROM inventory i JOIN storage_locations sl ON sl.id=i.storage_location_id
          WHERE i.id IN (SELECT fp.inventory_id FROM fulfillment_picks fp JOIN fulfillment_wave_items wi ON wi.id=fp.wave_item_id WHERE wi.fulfillment_item_id=$1)
            AND i.stock_status='reserved' AND i.quantity>0 FOR UPDATE OF i`,[itemId]);
        let remaining=qty;
        for(const pick of picks.rows) {
          if(remaining<=0) break;
          const allocations=await client.query(`SELECT fp.id,fp.quantity,fp.dispatched_quantity FROM fulfillment_picks fp
            JOIN fulfillment_wave_items wi ON wi.id=fp.wave_item_id WHERE wi.fulfillment_item_id=$1 AND fp.inventory_id=$2
            AND fp.quantity>fp.dispatched_quantity ORDER BY fp.picked_at,fp.id FOR UPDATE OF fp`,[itemId,pick.inventory_id]);
          for(const allocation of allocations.rows) {
            if(remaining<=0) break;
            const allocatedRemaining=Number(allocation.quantity)-Number(allocation.dispatched_quantity);
            const moveQty=Math.min(remaining,allocatedRemaining,Number(pick.quantity));
            if(moveQty<=0) continue;
            await decrementInventory(client,pick.inventory_id,moveQty);
            await client.query(`WITH sold AS (SELECT id FROM inventory_unit_serials WHERE company_id=$1 AND batch_id=$2 AND inventory_id=$3 AND status='reserved' ORDER BY created_at,id LIMIT $4 FOR UPDATE)
              UPDATE inventory_unit_serials us SET inventory_id=NULL,status='sold',source_reference=$5,updated_at=CURRENT_TIMESTAMP FROM sold WHERE us.id=sold.id`,[companyId,pick.batch_id,pick.inventory_id,moveQty,dispatchNumber]);
            await client.query('UPDATE fulfillment_picks SET dispatched_quantity=dispatched_quantity+$1 WHERE id=$2',[moveQty,allocation.id]);
            await client.query(`INSERT INTO stock_movements(inventory_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by)
              VALUES($1,$2,'sale',$3,$4,$5,$6)`,[pick.inventory_id,pick.batch_id,-moveQty,event.rows[0].id,`Salida física ${dispatchNumber} · ${order.rows[0].fulfillment_number}`,userId||null]);
            await client.query(`INSERT INTO storage_movements(company_id,inventory_id,batch_id,product_id,warehouse_id,from_location_id,to_location_id,movement_type,quantity,from_status,to_status,reference,notes,created_by)
              SELECT $1,$2,$3,fi.product_id,$4,$5,NULL,'dispatch',$6,'reserved',NULL,$7,'Confirmación de salida física', $8
              FROM fulfillment_items fi WHERE fi.id=$9`,[companyId,pick.inventory_id,pick.batch_id,pick.warehouse_id,pick.storage_location_id,moveQty,dispatchNumber,userId||null,itemId]);
            remaining-=moveQty;
          }
        }
        if(remaining>0) throw new ConflictException('No hay suficiente inventario reservado en la zona de despacho para confirmar la salida.');
        await client.query('UPDATE fulfillment_items SET dispatched_quantity=dispatched_quantity+$1 WHERE id=$2',[qty,itemId]);
        await client.query('INSERT INTO dispatch_event_items(dispatch_event_id,fulfillment_item_id,quantity) VALUES($1,$2,$3)',[event.rows[0].id,itemId,qty]);
        let packageQty=qty;
        const packs=await client.query(`SELECT * FROM fulfillment_package_items WHERE fulfillment_item_id=$1 AND quantity>dispatched_quantity ORDER BY package_id FOR UPDATE`,[itemId]);
        for(const pack of packs.rows) {
          if(packageQty<=0) break;
          const allocated=Math.min(packageQty,Number(pack.quantity)-Number(pack.dispatched_quantity));
          await client.query('UPDATE fulfillment_package_items SET dispatched_quantity=dispatched_quantity+$1 WHERE package_id=$2 AND fulfillment_item_id=$3',[allocated,pack.package_id,itemId]);
          packageQty-=allocated;
        }
      }
      const totals=await client.query(`SELECT COALESCE(SUM(ordered_quantity),0)::int ordered,COALESCE(SUM(dispatched_quantity),0)::int dispatched,
        COALESCE(SUM(picked_quantity),0)::int picked,COALESCE(SUM(packed_quantity),0)::int packed FROM fulfillment_items WHERE fulfillment_order_id=$1`,[orderId]);
      const totalsRow=totals.rows[0];
      const status=Number(totalsRow.dispatched)>=Number(totalsRow.ordered)?'dispatched':Number(totalsRow.dispatched)>0?'partially_dispatched':Number(totalsRow.packed)>=Number(totalsRow.ordered)?'packed':Number(totalsRow.picked)>=Number(totalsRow.ordered)?'picked':'picking';
      await client.query('UPDATE fulfillment_orders SET status=$1,dispatched_by=$2,completed_at=CASE WHEN $1=\'dispatched\' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=$3',[status,userId||null,orderId]);
      const response={success:true,dispatch_number:event.rows[0].dispatch_number,status};await completeLogisticsRequest(client,companyId,'dispatch.confirm',idempotencyKey,payload,response);
      await client.query('COMMIT');
      return response;
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
