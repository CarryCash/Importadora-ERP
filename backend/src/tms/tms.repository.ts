import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class TmsRepository {
  constructor(private readonly db:DatabaseService){}

  async context(companyId:string){
    const [carriers,vehicles,drivers,tariffs,orders,incidents]=await Promise.all([
      this.db.query('SELECT * FROM tms_carriers WHERE company_id=$1 ORDER BY is_active DESC,name',[companyId]),
      this.db.query(`SELECT v.*,c.name carrier_name,(v.registration_expiry IS NOT NULL AND v.registration_expiry<CURRENT_DATE) registration_expired,
        (v.insurance_expiry IS NOT NULL AND v.insurance_expiry<CURRENT_DATE) insurance_expired
        FROM tms_vehicles v LEFT JOIN tms_carriers c ON c.id=v.carrier_id WHERE v.company_id=$1 ORDER BY v.status,v.plate`,[companyId]),
      this.db.query(`SELECT d.*,c.name carrier_name,(d.license_expiry<CURRENT_DATE) license_expired FROM tms_drivers d LEFT JOIN tms_carriers c ON c.id=d.carrier_id
        WHERE d.company_id=$1 ORDER BY d.status,d.full_name`,[companyId]),
      this.db.query(`SELECT t.*,c.name carrier_name FROM tms_tariffs t LEFT JOIN tms_carriers c ON c.id=t.carrier_id WHERE t.company_id=$1 ORDER BY t.is_active DESC,t.name,t.zone`,[companyId]),
      this.db.query(`SELECT f.id,f.fulfillment_number,f.status,f.priority,f.recipient_name,f.shipping_address,f.shipping_city,f.shipping_phone,
        s.sale_number,COALESCE(SUM(fi.dispatched_quantity),0)::int dispatched_units,
        GREATEST(0,COALESCE(SUM(fi.dispatched_quantity),0)-COALESCE(delivered.units,0))::int pending_delivery_units,
        COALESCE(SUM(fi.dispatched_quantity*p.weight_kg),0)::numeric shipment_weight_kg,
        COALESCE(SUM(fi.dispatched_quantity*p.volume_m3),0)::numeric shipment_volume_m3,
        COALESCE(pkg.package_count,0)::int package_count,
        COALESCE(pkg.package_weight,0)::numeric package_weight_kg,COALESCE(pkg.package_volume,0)::numeric package_volume_m3
        FROM fulfillment_orders f JOIN sales s ON s.id=f.sale_id LEFT JOIN fulfillment_items fi ON fi.fulfillment_order_id=f.id
        LEFT JOIN products p ON p.id=fi.product_id
        LEFT JOIN LATERAL(SELECT COUNT(*)::int package_count,SUM(weight_kg) package_weight,SUM(volume_m3) package_volume FROM fulfillment_packages WHERE fulfillment_order_id=f.id) pkg ON true
        LEFT JOIN LATERAL(SELECT SUM(si.delivered_quantity)::int units FROM tms_stop_items si JOIN tms_trip_stops st ON st.id=si.stop_id WHERE st.fulfillment_order_id=f.id) delivered ON true
        WHERE f.company_id=$1 AND f.status IN ('dispatched','partially_dispatched')
          AND NOT EXISTS(SELECT 1 FROM tms_trip_stops st JOIN tms_trips tr ON tr.id=st.trip_id WHERE st.fulfillment_order_id=f.id AND tr.status IN ('planned','in_route'))
          AND COALESCE((SELECT SUM(fi2.dispatched_quantity) FROM fulfillment_items fi2 WHERE fi2.fulfillment_order_id=f.id),0)>COALESCE(delivered.units,0)
        GROUP BY f.id,s.sale_number,pkg.package_count,pkg.package_weight,pkg.package_volume,delivered.units
        ORDER BY f.created_at DESC LIMIT 500`,[companyId]),
      this.db.query(`SELECT i.*,tr.trip_number FROM tms_incidents i JOIN tms_trips tr ON tr.id=i.trip_id
        WHERE i.company_id=$1 ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'claim' THEN 1 ELSE 2 END,i.occurred_at DESC LIMIT 300`,[companyId]),
    ]);
    return {carriers:carriers.rows,vehicles:vehicles.rows,drivers:drivers.rows,tariffs:tariffs.rows,orders:orders.rows,incidents:incidents.rows};
  }

  async trips(companyId:string){
    return (await this.db.query(`SELECT tr.*,c.name carrier_name,v.plate vehicle_plate,v.vehicle_type,d.full_name driver_name,ta.name tariff_name,
      COUNT(DISTINCT st.id)::int stop_count,COUNT(DISTINCT st.id) FILTER(WHERE st.status IN ('delivered','partial','failed','rescheduled'))::int completed_stops,
      COALESCE(ex.amount,0)::numeric expense_total,COALESCE(ex.count,0)::int expense_count,
      COALESCE(inc.open_count,0)::int open_incidents
      FROM tms_trips tr LEFT JOIN tms_carriers c ON c.id=tr.carrier_id LEFT JOIN tms_vehicles v ON v.id=tr.vehicle_id
      LEFT JOIN tms_drivers d ON d.id=tr.driver_id LEFT JOIN tms_tariffs ta ON ta.id=tr.tariff_id
      LEFT JOIN tms_trip_stops st ON st.trip_id=tr.id
      LEFT JOIN LATERAL(SELECT SUM(amount) amount,COUNT(*)::int count FROM tms_trip_expenses WHERE trip_id=tr.id) ex ON true
      LEFT JOIN LATERAL(SELECT COUNT(*)::int open_count FROM tms_incidents WHERE trip_id=tr.id AND status IN ('open','claim')) inc ON true
      WHERE tr.company_id=$1 GROUP BY tr.id,c.name,v.plate,v.vehicle_type,d.full_name,ta.name,ex.amount,ex.count,inc.open_count
      ORDER BY CASE tr.status WHEN 'in_route' THEN 0 WHEN 'planned' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END,tr.planned_departure DESC LIMIT 300`,[companyId])).rows;
  }

  async trip(companyId:string,id:string){
    const header=await this.db.query(`SELECT tr.*,c.name carrier_name,c.phone carrier_phone,v.plate vehicle_plate,v.vehicle_type,v.capacity_kg,v.capacity_m3,v.capacity_packages,
      v.registration_expiry,v.insurance_expiry,d.full_name driver_name,d.phone driver_phone,d.license_number,d.license_type,d.license_expiry,
      ta.name tariff_name FROM tms_trips tr LEFT JOIN tms_carriers c ON c.id=tr.carrier_id LEFT JOIN tms_vehicles v ON v.id=tr.vehicle_id
      LEFT JOIN tms_drivers d ON d.id=tr.driver_id LEFT JOIN tms_tariffs ta ON ta.id=tr.tariff_id WHERE tr.company_id=$1 AND tr.id=$2`,[companyId,id]);
    if(!header.rowCount)throw new NotFoundException('Viaje no encontrado.');
    const [stops,events,expenses,incidents,manifest]=await Promise.all([
      this.db.query(`SELECT st.*,f.fulfillment_number,f.status fulfillment_status,f.recipient_name,f.shipping_address,f.shipping_city,f.shipping_phone,s.sale_number,
        COALESCE(q.expected_units,0)::int expected_units,COALESCE(q.delivered_units,0)::int delivered_units
        FROM tms_trip_stops st JOIN fulfillment_orders f ON f.id=st.fulfillment_order_id JOIN sales s ON s.id=f.sale_id
        LEFT JOIN LATERAL(SELECT SUM(expected_quantity) expected_units,SUM(delivered_quantity) delivered_units FROM tms_stop_items WHERE stop_id=st.id) q ON true
        WHERE st.trip_id=$1 ORDER BY st.sequence_number`,[id]),
      this.db.query(`SELECT e.*,u.full_name created_by_name FROM tms_trip_events e LEFT JOIN users u ON u.id=e.created_by WHERE e.trip_id=$1 ORDER BY e.created_at DESC`,[id]),
      this.db.query(`SELECT e.*,u.full_name created_by_name FROM tms_trip_expenses e LEFT JOIN users u ON u.id=e.created_by WHERE e.trip_id=$1 ORDER BY e.created_at DESC`,[id]),
      this.db.query(`SELECT i.*,u.full_name created_by_name,ru.full_name resolved_by_name FROM tms_incidents i LEFT JOIN users u ON u.id=i.created_by LEFT JOIN users ru ON ru.id=i.resolved_by WHERE i.trip_id=$1 ORDER BY i.occurred_at DESC`,[id]),
      this.db.query(`SELECT m.*,f.fulfillment_number,s.sale_number,f.recipient_name,f.shipping_address,f.shipping_city FROM tms_trip_manifest_items m
        JOIN fulfillment_orders f ON f.id=m.fulfillment_order_id JOIN sales s ON s.id=f.sale_id WHERE m.trip_id=$1 ORDER BY f.fulfillment_number`,[id]),
    ]);
    const stopItems=stops.rowCount?await this.db.query(`SELECT si.*,fi.product_id,p.name product_name,p.sku,b.batch_number FROM tms_stop_items si
      JOIN fulfillment_items fi ON fi.id=si.fulfillment_item_id JOIN products p ON p.id=fi.product_id JOIN product_batches b ON b.id=fi.batch_id
      WHERE si.stop_id=ANY($1::uuid[]) ORDER BY p.name,b.batch_number`,[stops.rows.map((stop:any)=>stop.id)]):{rows:[]};
    return {...header.rows[0],stops:stops.rows.map((stop:any)=>({...stop,items:stopItems.rows.filter((item:any)=>item.stop_id===stop.id)})),events:events.rows,expenses:expenses.rows,incidents:incidents.rows,manifest:manifest.rows};
  }

  async createCarrier(companyId:string,data:any){
    const result=await this.db.query(`INSERT INTO tms_carriers(company_id,name,carrier_type,tax_id,contact_name,phone,email,service_zones)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[companyId,String(data.name).trim(),data.carrier_type||'transport_company',data.tax_id||null,data.contact_name||null,data.phone||null,data.email||null,Array.isArray(data.service_zones)?data.service_zones:[]]);
    return result.rows[0];
  }

  async createVehicle(companyId:string,data:any){
    if(data.carrier_id){const carrier=await this.db.query('SELECT id FROM tms_carriers WHERE company_id=$1 AND id=$2',[companyId,data.carrier_id]);if(!carrier.rowCount)throw new NotFoundException('Transportista no encontrado.');}
    const result=await this.db.query(`INSERT INTO tms_vehicles(company_id,carrier_id,plate,vehicle_type,is_owned,capacity_kg,capacity_m3,capacity_packages,registration_expiry,insurance_expiry,notes)
      VALUES($1,$2,UPPER($3),$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[companyId,data.carrier_id||null,String(data.plate).trim(),String(data.vehicle_type).trim(),Boolean(data.is_owned),Number(data.capacity_kg||0),Number(data.capacity_m3||0),Number(data.capacity_packages||0),data.registration_expiry||null,data.insurance_expiry||null,data.notes||null]);
    return result.rows[0];
  }

  async createDriver(companyId:string,data:any){
    if(data.carrier_id){const carrier=await this.db.query('SELECT id FROM tms_carriers WHERE company_id=$1 AND id=$2',[companyId,data.carrier_id]);if(!carrier.rowCount)throw new NotFoundException('Transportista no encontrado.');}
    const result=await this.db.query(`INSERT INTO tms_drivers(company_id,carrier_id,full_name,identification_number,phone,license_number,license_type,license_expiry)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[companyId,data.carrier_id||null,String(data.full_name).trim(),data.identification_number||null,data.phone||null,String(data.license_number).trim(),data.license_type||null,data.license_expiry]);
    return result.rows[0];
  }

  async createTariff(companyId:string,data:any){
    if(data.carrier_id){const carrier=await this.db.query('SELECT id FROM tms_carriers WHERE company_id=$1 AND id=$2',[companyId,data.carrier_id]);if(!carrier.rowCount)throw new NotFoundException('Transportista no encontrado.');}
    const result=await this.db.query(`INSERT INTO tms_tariffs(company_id,carrier_id,name,zone,base_amount,per_km,per_kg,per_m3,per_package,per_stop,minimum_amount)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[companyId,data.carrier_id||null,String(data.name).trim(),data.zone||null,...['base_amount','per_km','per_kg','per_m3','per_package','per_stop','minimum_amount'].map((key)=>Number(data[key]||0))]);
    return result.rows[0];
  }

  async updateResource(companyId:string,kind:string,id:string,data:any,allowed:string[]){
    const tables:Record<string,string>={carriers:'tms_carriers',vehicles:'tms_vehicles',drivers:'tms_drivers',tariffs:'tms_tariffs'};
    const fields=allowed.filter((field)=>data[field]!==undefined);
    if(!fields.length){const result=await this.db.query(`SELECT * FROM ${tables[kind]} WHERE company_id=$1 AND id=$2`,[companyId,id]);if(!result.rowCount)throw new NotFoundException('Recurso de transporte no encontrado.');return result.rows[0];}
    const values=fields.map((field)=>data[field]);
    const setters=fields.map((field,index)=>`${field}=$${index+3}`);
    const result=await this.db.query(`UPDATE ${tables[kind]} SET ${setters.join(',')},updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2 RETURNING *`,[companyId,id,...values]);
    if(!result.rowCount)throw new NotFoundException('Recurso de transporte no encontrado.');return result.rows[0];
  }

  async createTrip(companyId:string,userId:string,data:any){
    const client=await this.db.getPool().connect();
    try{
      await client.query('BEGIN');
      const [carrier,vehicle,driver]=await Promise.all([
        client.query('SELECT * FROM tms_carriers WHERE company_id=$1 AND id=$2 AND is_active FOR UPDATE',[companyId,data.carrier_id]),
        client.query('SELECT * FROM tms_vehicles WHERE company_id=$1 AND id=$2 AND status=\'active\' FOR UPDATE',[companyId,data.vehicle_id]),
        client.query('SELECT * FROM tms_drivers WHERE company_id=$1 AND id=$2 AND status=\'active\' FOR UPDATE',[companyId,data.driver_id]),
      ]);
      if(!carrier.rowCount||!vehicle.rowCount||!driver.rowCount)throw new NotFoundException('Transportista, vehículo y conductor deben estar activos en esta empresa.');
      const v=vehicle.rows[0],d=driver.rows[0],c=carrier.rows[0];
      if(v.carrier_id&&v.carrier_id!==c.id)throw new BadRequestException('El vehículo pertenece a otro transportista.');
      if(d.carrier_id&&d.carrier_id!==c.id)throw new BadRequestException('El conductor pertenece a otro transportista.');
      const ids: string[] = [...new Set((data.order_ids as unknown[]).map(String))];
      const lockedOrders=await client.query(`SELECT id FROM fulfillment_orders WHERE company_id=$1 AND id=ANY($2::uuid[]) AND status IN ('dispatched','partially_dispatched') FOR UPDATE`,[companyId,ids]);
      if(lockedOrders.rowCount!==ids.length)throw new ConflictException('Solo se pueden programar pedidos despachados que pertenezcan a esta empresa.');
      const orders=await client.query(`SELECT f.*,s.sale_number,COALESCE(SUM(fi.dispatched_quantity),0)::int dispatched_units,
        COALESCE(SUM(fi.dispatched_quantity*p.weight_kg),0)::numeric shipment_weight_kg,
        COALESCE(SUM(fi.dispatched_quantity*p.volume_m3),0)::numeric shipment_volume_m3,
        COALESCE(pkg.package_count,0)::int package_count,COALESCE(pkg.package_weight,0)::numeric package_weight_kg,COALESCE(pkg.package_volume,0)::numeric package_volume_m3,
        GREATEST(0,COALESCE(SUM(fi.dispatched_quantity),0)-COALESCE(dl.delivered_units,0))::int remaining_delivery_units
        FROM fulfillment_orders f JOIN sales s ON s.id=f.sale_id LEFT JOIN fulfillment_items fi ON fi.fulfillment_order_id=f.id LEFT JOIN products p ON p.id=fi.product_id
        LEFT JOIN LATERAL(SELECT COUNT(*)::int package_count,SUM(weight_kg) package_weight,SUM(volume_m3) package_volume FROM fulfillment_packages WHERE fulfillment_order_id=f.id) pkg ON true
        LEFT JOIN LATERAL(SELECT SUM(si.delivered_quantity)::int delivered_units FROM tms_stop_items si JOIN tms_trip_stops st ON st.id=si.stop_id WHERE st.fulfillment_order_id=f.id) dl ON true
        WHERE f.company_id=$1 AND f.id=ANY($2::uuid[]) AND f.status IN ('dispatched','partially_dispatched')
        GROUP BY f.id,s.sale_number,pkg.package_count,pkg.package_weight,pkg.package_volume,dl.delivered_units`,[companyId,ids]);
      if(orders.rowCount!==ids.length)throw new ConflictException('Solo se pueden programar pedidos despachados que pertenezcan a esta empresa.');
      if(orders.rows.some((row:any)=>Number(row.remaining_delivery_units)<=0))throw new ConflictException('Uno de los pedidos ya fue entregado por completo.');
      const existing=await client.query(`SELECT 1 FROM tms_trip_stops st JOIN tms_trips tr ON tr.id=st.trip_id WHERE st.fulfillment_order_id=ANY($1::uuid[]) AND tr.status IN ('planned','in_route') LIMIT 1`,[ids]);
      if(existing.rowCount)throw new ConflictException('Uno de los pedidos ya está asignado a un viaje abierto.');
      const weight=orders.rows.reduce((sum:number,row:any)=>sum+Number(row.package_weight||row.shipment_weight_kg||0),0);
      const volume=orders.rows.reduce((sum:number,row:any)=>sum+Number(row.package_volume||row.shipment_volume_m3||0),0);
      const packages=orders.rows.reduce((sum:number,row:any)=>sum+Number(row.package_count||0),0);
      if(Number(v.capacity_kg)>0&&weight>Number(v.capacity_kg))throw new ConflictException(`La carga estimada (${weight.toFixed(1)} kg) supera la capacidad del vehículo.`);
      if(Number(v.capacity_m3)>0&&volume>Number(v.capacity_m3))throw new ConflictException(`El volumen estimado (${volume.toFixed(2)} m³) supera la capacidad del vehículo.`);
      if(Number(v.capacity_packages)>0&&packages>Number(v.capacity_packages))throw new ConflictException('La cantidad de paquetes supera la capacidad del vehículo.');
      let tariff:any=null;
      if(data.tariff_id){const result=await client.query(`SELECT * FROM tms_tariffs WHERE company_id=$1 AND id=$2 AND is_active AND (carrier_id IS NULL OR carrier_id=$3)
        AND (zone IS NULL OR LOWER(zone)=LOWER($4)) FOR UPDATE`,[companyId,data.tariff_id,c.id,data.zone||'']);if(!result.rowCount)throw new BadRequestException('La tarifa no está activa, no corresponde al transportista o a la zona.');tariff=result.rows[0];}
      let estimatedCost=Number(data.estimated_cost||0);
      if(tariff){const raw=Number(tariff.base_amount)+Number(data.planned_distance_km)*Number(tariff.per_km)+weight*Number(tariff.per_kg)+volume*Number(tariff.per_m3)+packages*Number(tariff.per_package)+ids.length*Number(tariff.per_stop);estimatedCost=Math.max(Number(tariff.minimum_amount),raw);}
      const sequence=await client.query("SELECT nextval('tms_trip_number_seq') n");
      const tripNumber=`VIA-${new Date().getFullYear()}-${String(sequence.rows[0].n).padStart(5,'0')}`;
      const trip=await client.query(`INSERT INTO tms_trips(company_id,trip_number,status,carrier_id,vehicle_id,driver_id,tariff_id,route_name,zone,planned_departure,planned_return,planned_distance_km,planned_duration_minutes,estimated_cost,notes,created_by)
        VALUES($1,$2,'planned',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[companyId,tripNumber,c.id,v.id,d.id,tariff?.id||null,String(data.route_name).trim(),data.zone||null,data.planned_departure,data.planned_return||null,Number(data.planned_distance_km||0),Number(data.planned_duration_minutes||0),estimatedCost,data.notes||null,userId||null]);
      const stopInput = new Map<string, any>();
      for (const stop of (data.stops || []) as any[]) stopInput.set(String(stop.order_id), stop);
      let sequenceNumber=0;
      for(const id of ids){
        const order=orders.rows.find((row:any)=>row.id===id);
        const stopData=stopInput.get(id)||{};
        const stop=await client.query(`INSERT INTO tms_trip_stops(trip_id,fulfillment_order_id,sequence_number,stop_name,address,city,scheduled_from,scheduled_to)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[trip.rows[0].id,id,++sequenceNumber,order.recipient_name,order.shipping_address,order.shipping_city,stopData.scheduled_from||null,stopData.scheduled_to||null]);
        const lines=await client.query(`SELECT fi.id,fi.dispatched_quantity-COALESCE(delivered.units,0) pending FROM fulfillment_items fi
          LEFT JOIN LATERAL(SELECT SUM(si.delivered_quantity)::int units FROM tms_stop_items si WHERE si.fulfillment_item_id=fi.id) delivered ON true
          WHERE fi.fulfillment_order_id=$1 AND fi.dispatched_quantity>COALESCE(delivered.units,0)`,[id]);
        for(const line of lines.rows)if(Number(line.pending)>0)await client.query('INSERT INTO tms_stop_items(stop_id,fulfillment_item_id,expected_quantity) VALUES($1,$2,$3)',[stop.rows[0].id,line.id,line.pending]);
        await client.query('INSERT INTO tms_trip_manifest_items(trip_id,fulfillment_order_id,manifest_number) VALUES($1,$2,$3)',[trip.rows[0].id,id,`MAN-${tripNumber}`]);
      }
      await this.event(client,trip.rows[0].id,null,'planned',userId,{route_name:data.route_name,orders:ids,estimated_cost:estimatedCost});
      await client.query('COMMIT');
      return {id:trip.rows[0].id,trip_number:tripNumber,status:'planned',estimated_cost:estimatedCost};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async depart(companyId:string,userId:string,id:string,data:any){
    const client=await this.db.getPool().connect();
    try{
      await client.query('BEGIN');
      const trip=await client.query(`SELECT tr.*,v.registration_expiry,v.insurance_expiry,d.license_expiry FROM tms_trips tr
        JOIN tms_vehicles v ON v.id=tr.vehicle_id JOIN tms_drivers d ON d.id=tr.driver_id WHERE tr.company_id=$1 AND tr.id=$2 AND tr.status='planned' FOR UPDATE OF tr,v,d`,[companyId,id]);
      if(!trip.rowCount)throw new ConflictException('Solo se puede iniciar un viaje planificado.');
      const row=trip.rows[0];
      if(row.registration_expiry&&new Date(row.registration_expiry)<new Date(new Date().toISOString().slice(0,10)))throw new ConflictException('La matrícula o revisión del vehículo está vencida.');
      if(row.insurance_expiry&&new Date(row.insurance_expiry)<new Date(new Date().toISOString().slice(0,10)))throw new ConflictException('El seguro del vehículo está vencido.');
      if(new Date(row.license_expiry)<new Date(new Date().toISOString().slice(0,10)))throw new ConflictException('La licencia del conductor está vencida.');
      const pending=await client.query(`SELECT COUNT(*)::int count FROM tms_trip_stops WHERE trip_id=$1 AND status<>'planned'`,[id]);
      if(Number(pending.rows[0].count)>0)throw new ConflictException('El viaje tiene paradas ya iniciadas; actualiza el plan.');
      const open=await client.query(`SELECT COUNT(*)::int count FROM tms_trip_stops st JOIN fulfillment_orders f ON f.id=st.fulfillment_order_id
        WHERE st.trip_id=$1 AND f.status NOT IN ('dispatched','partially_dispatched')`,[id]);
      if(Number(open.rows[0].count)>0)throw new ConflictException('Todos los pedidos deben haber salido físicamente por Preparación y despacho antes de iniciar la ruta.');
      await client.query(`UPDATE tms_trips SET status='in_route',departed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[id]);
      await this.event(client,id,null,'departed',userId,{notes:data.notes||null,plate:row.vehicle_plate});
      await client.query('COMMIT');return {success:true,status:'in_route'};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async resequence(companyId:string,id:string,stopIds:string[]){
    const client=await this.db.getPool().connect();
    try{
      await client.query('BEGIN');
      const trip=await client.query("SELECT id FROM tms_trips WHERE company_id=$1 AND id=$2 AND status='planned' FOR UPDATE",[companyId,id]);
      if(!trip.rowCount)throw new ConflictException('Solo se puede cambiar el orden de un viaje planificado.');
      const current=await client.query('SELECT id FROM tms_trip_stops WHERE trip_id=$1 ORDER BY sequence_number FOR UPDATE',[id]);
      if(stopIds.length!==current.rowCount||new Set(stopIds).size!==current.rowCount||current.rows.some((stop:any)=>!stopIds.includes(stop.id)))throw new BadRequestException('Incluye todas las paradas una sola vez.');
      await client.query('UPDATE tms_trip_stops SET sequence_number=sequence_number+10000 WHERE trip_id=$1',[id]);
      for(let index=0;index<stopIds.length;index++)await client.query('UPDATE tms_trip_stops SET sequence_number=$1 WHERE id=$2',[index+1,stopIds[index]]);
      await client.query('COMMIT');return {success:true};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async updateWindow(companyId:string,id:string,stopId:string,data:any){
    if(data.scheduled_from&&data.scheduled_to&&new Date(data.scheduled_to)<=new Date(data.scheduled_from))throw new BadRequestException('El fin de la ventana debe ser posterior al inicio.');
    const updated=await this.db.query(`UPDATE tms_trip_stops st SET scheduled_from=$4,scheduled_to=$5 FROM tms_trips tr
      WHERE st.trip_id=tr.id AND tr.company_id=$1 AND tr.id=$2 AND tr.status='planned' AND st.id=$3 RETURNING st.*`,[companyId,id,stopId,data.scheduled_from||null,data.scheduled_to||null]);
    if(!updated.rowCount)throw new NotFoundException('No se encontró la parada planificada.');return updated.rows[0];
  }

  async updateStop(companyId:string,userId:string,id:string,stopId:string,data:any){
    const client=await this.db.getPool().connect();
    try{
      await client.query('BEGIN');
      const trip=await client.query("SELECT * FROM tms_trips WHERE company_id=$1 AND id=$2 AND status='in_route' FOR UPDATE",[companyId,id]);
      if(!trip.rowCount)throw new ConflictException('El viaje debe estar en ruta para actualizar sus paradas.');
      const stop=await client.query('SELECT * FROM tms_trip_stops WHERE id=$1 AND trip_id=$2 FOR UPDATE',[stopId,id]);
      if(!stop.rowCount)throw new NotFoundException('Parada no encontrada.');
      if(!['planned','arrived'].includes(stop.rows[0].status))throw new ConflictException('La parada ya quedó cerrada y no se puede volver a modificar.');
      if(data.status==='arrived'){
        await client.query("UPDATE tms_trip_stops SET status='arrived',arrived_at=COALESCE(arrived_at,CURRENT_TIMESTAMP) WHERE id=$1",[stopId]);
        await this.event(client,id,stopId,'arrived',userId,{notes:data.delivery_notes||null});
      }else if(['delivered','partial'].includes(data.status)){
        if(!String(data.received_by||'').trim()&&!data.signature_reference&&!data.photo_reference)throw new BadRequestException('Registra el nombre de quien recibe o adjunta la referencia de firma/foto para la prueba de entrega.');
        const lineRows=await client.query('SELECT * FROM tms_stop_items WHERE stop_id=$1 FOR UPDATE',[stopId]);
        const quantities=new Map<string,number>();for(const item of data.items)quantities.set(item.fulfillment_item_id,(quantities.get(item.fulfillment_item_id)||0)+Number(item.quantity||0));
        let added=0,total=0;
        for(const line of lineRows.rows){
          const quantity=quantities.get(line.fulfillment_item_id)||0;
          if(!Number.isInteger(quantity)||quantity<0||quantity>Number(line.expected_quantity)-Number(line.delivered_quantity))throw new BadRequestException('Una cantidad entregada supera lo pendiente de esta parada.');
          added+=quantity;total+=Number(line.delivered_quantity)+quantity;
          if(quantity>0)await client.query('UPDATE tms_stop_items SET delivered_quantity=delivered_quantity+$1 WHERE stop_id=$2 AND fulfillment_item_id=$3',[quantity,stopId,line.fulfillment_item_id]);
          quantities.delete(line.fulfillment_item_id);
        }
        if(quantities.size)throw new BadRequestException('Un artículo indicado no pertenece a esta parada.');
        const expected=lineRows.rows.reduce((sum:number,line:any)=>sum+Number(line.expected_quantity),0);
        if(added<=0)throw new BadRequestException('Registra al menos una unidad entregada.');
        if(data.status==='delivered'&&total!==expected)throw new BadRequestException('Para marcar entrega completa, todas las unidades deben quedar entregadas.');
        if(data.status==='partial'&&total>=expected)throw new BadRequestException('Usa entrega completa cuando ya se entregaron todas las unidades.');
        await client.query(`UPDATE tms_trip_stops SET status=$2,completed_at=CURRENT_TIMESTAMP,received_by=$3,signature_reference=$4,photo_reference=$5,
          latitude=$6,longitude=$7,delivery_notes=$8 WHERE id=$1`,[stopId,data.status,String(data.received_by||'').trim()||null,data.signature_reference||null,data.photo_reference||null,data.latitude??null,data.longitude??null,data.delivery_notes||null]);
        await this.event(client,id,stopId,data.status,userId,{received_by:data.received_by||null,delivered_units:added,expected_units:expected,latitude:data.latitude??null,longitude:data.longitude??null,signature_reference:data.signature_reference||null,photo_reference:data.photo_reference||null,notes:data.delivery_notes||null});
      }else{
        if(data.status==='failed'&&stop.rows[0].status==='arrived'){}
        await client.query(`UPDATE tms_trip_stops SET status=$2,completed_at=CURRENT_TIMESTAMP,rescheduled_for=$3,failure_reason=$4,delivery_notes=$5 WHERE id=$1`,[stopId,data.status,data.status==='rescheduled'?data.rescheduled_for:null,data.status==='failed'?String(data.failure_reason).trim():null,data.delivery_notes||null]);
        await this.event(client,id,stopId,data.status,userId,{rescheduled_for:data.rescheduled_for||null,failure_reason:data.failure_reason||null,notes:data.delivery_notes||null});
      }
      await client.query('COMMIT');return {success:true,status:data.status};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async addExpense(companyId:string,userId:string,id:string,data:any){
    const trip=await this.db.query("SELECT id FROM tms_trips WHERE company_id=$1 AND id=$2 AND status IN ('planned','in_route')",[companyId,id]);
    if(!trip.rowCount)throw new ConflictException('Solo se agregan gastos a viajes abiertos.');
    const result=await this.db.query(`INSERT INTO tms_trip_expenses(trip_id,expense_type,description,amount,receipt_reference,created_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[id,data.expense_type,String(data.description).trim(),Number(data.amount),data.receipt_reference||null,userId||null]);
    return result.rows[0];
  }

  async closeTrip(companyId:string,userId:string,id:string,data:any){
    const client=await this.db.getPool().connect();
    try{
      await client.query('BEGIN');
      const trip=await client.query("SELECT * FROM tms_trips WHERE company_id=$1 AND id=$2 AND status='in_route' FOR UPDATE",[companyId,id]);
      if(!trip.rowCount)throw new ConflictException('El viaje debe estar en ruta para cerrarse.');
      const pending=await client.query("SELECT COUNT(*)::int count FROM tms_trip_stops WHERE trip_id=$1 AND status IN ('planned','arrived')",[id]);
      if(Number(pending.rows[0].count)>0)throw new ConflictException('Resuelve todas las paradas como entregadas, parciales, fallidas o reprogramadas antes de cerrar.');
      const expenses=await client.query('SELECT COALESCE(SUM(amount),0)::numeric total FROM tms_trip_expenses WHERE trip_id=$1',[id]);
      const invoice=Number(data.invoiced_amount||0),estimated=Number(trip.rows[0].estimated_cost);
      const reconciliation=data.invoice_reference&&invoice>0?(Math.abs(invoice-estimated)<=0.01?'matched':'variance'):'pending';
      await client.query(`UPDATE tms_trips SET status='closed',returned_at=CURRENT_TIMESTAMP,actual_cost=$1,invoiced_amount=$2,invoice_reference=$3,
        reconciliation_status=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$5`,[Number(expenses.rows[0].total),invoice,data.invoice_reference||null,reconciliation,id]);
      await this.event(client,id,null,'closed',userId,{actual_cost:Number(expenses.rows[0].total),invoiced_amount:invoice,invoice_reference:data.invoice_reference||null,reconciliation_status:reconciliation});
      await client.query('COMMIT');return {success:true,status:'closed',actual_cost:Number(expenses.rows[0].total),reconciliation_status:reconciliation,variance:invoice-estimated};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async addIncident(companyId:string,userId:string,id:string,data:any){
    const trip=await this.db.query('SELECT id FROM tms_trips WHERE company_id=$1 AND id=$2',[companyId,id]);if(!trip.rowCount)throw new NotFoundException('Viaje no encontrado.');
    if(data.stop_id){const stop=await this.db.query('SELECT id FROM tms_trip_stops WHERE id=$1 AND trip_id=$2',[data.stop_id,id]);if(!stop.rowCount)throw new NotFoundException('La parada no pertenece a este viaje.');}
    const result=await this.db.query(`INSERT INTO tms_incidents(company_id,trip_id,stop_id,incident_type,severity,description,claim_reference,estimated_loss,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[companyId,id,data.stop_id||null,data.incident_type,data.severity,String(data.description).trim(),data.claim_reference||null,Number(data.estimated_loss||0),userId||null]);
    await this.db.query(`INSERT INTO tms_trip_events(trip_id,stop_id,event_type,notes,details,created_by) VALUES($1,$2,'incident',$3,$4::jsonb,$5)`,[id,data.stop_id||null,String(data.description).trim(),JSON.stringify({incident_type:data.incident_type,severity:data.severity,estimated_loss:Number(data.estimated_loss||0)}),userId||null]);
    return result.rows[0];
  }

  async resolveIncident(companyId:string,userId:string,id:string,data:any){
    const result=await this.db.query(`UPDATE tms_incidents i SET status=$3,resolution_notes=$4,resolved_by=$5,resolved_at=CURRENT_TIMESTAMP
      FROM tms_trips tr WHERE tr.id=i.trip_id AND tr.company_id=$1 AND i.id=$2 AND i.status IN ('open','claim') RETURNING i.*`,[companyId,id,data.status,data.notes||null,userId||null]);
    if(!result.rowCount)throw new NotFoundException('Incidente abierto no encontrado.');return result.rows[0];
  }

  private async event(client:any,tripId:string,stopId:string|null,type:string,userId:string|null,details:any){
    await client.query(`INSERT INTO tms_trip_events(trip_id,stop_id,event_type,notes,details,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,[tripId,stopId,type,details.notes||null,JSON.stringify(details),userId||null]);
  }
}
