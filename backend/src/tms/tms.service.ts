import { BadRequestException, Injectable } from '@nestjs/common';
import { TmsRepository } from './tms.repository';

@Injectable()
export class TmsService {
  constructor(private readonly repository:TmsRepository){}
  context(companyId:string){return this.repository.context(companyId);}
  trips(companyId:string){return this.repository.trips(companyId);}
  trip(companyId:string,id:string){return this.repository.trip(companyId,id);}
  createCarrier(companyId:string,data:any){
    if(!String(data.name||'').trim()||!['transport_company','courier','own'].includes(data.carrier_type||'transport_company'))throw new BadRequestException('Indica un nombre y tipo válido de transportista.');
    return this.repository.createCarrier(companyId,data);
  }
  createVehicle(companyId:string,data:any){
    if(!String(data.plate||'').trim()||!String(data.vehicle_type||'').trim())throw new BadRequestException('Placa y tipo de vehículo son obligatorios.');
    for(const key of ['capacity_kg','capacity_m3','capacity_packages'])if(!Number.isFinite(Number(data[key]||0))||Number(data[key]||0)<0)throw new BadRequestException('Las capacidades deben ser números iguales o mayores que cero.');
    return this.repository.createVehicle(companyId,data);
  }
  createDriver(companyId:string,data:any){
    if(!String(data.full_name||'').trim()||!String(data.license_number||'').trim()||!data.license_expiry)throw new BadRequestException('Nombre, licencia y vigencia son obligatorios.');
    return this.repository.createDriver(companyId,data);
  }
  createTariff(companyId:string,data:any){
    if(!String(data.name||'').trim())throw new BadRequestException('La tarifa requiere un nombre.');
    for(const key of ['base_amount','per_km','per_kg','per_m3','per_package','per_stop','minimum_amount'])if(!Number.isFinite(Number(data[key]||0))||Number(data[key]||0)<0)throw new BadRequestException('Las tarifas deben ser números iguales o mayores que cero.');
    return this.repository.createTariff(companyId,data);
  }
  updateResource(companyId:string,kind:string,id:string,data:any){
    const allowed:Record<string,string[]>={carriers:['name','carrier_type','tax_id','contact_name','phone','email','service_zones','is_active'],vehicles:['carrier_id','plate','vehicle_type','is_owned','capacity_kg','capacity_m3','capacity_packages','registration_expiry','insurance_expiry','status','notes'],drivers:['carrier_id','full_name','identification_number','phone','license_number','license_type','license_expiry','status'],tariffs:['carrier_id','name','zone','base_amount','per_km','per_kg','per_m3','per_package','per_stop','minimum_amount','is_active']};
    if(!allowed[kind])throw new BadRequestException('Tipo de recurso no válido.');
    if(kind==='vehicles'||kind==='tariffs')for(const key of (kind==='vehicles'?['capacity_kg','capacity_m3','capacity_packages']:['base_amount','per_km','per_kg','per_m3','per_package','per_stop','minimum_amount']))if(data[key]!==undefined&&(!Number.isFinite(Number(data[key]))||Number(data[key])<0))throw new BadRequestException('Capacidad o tarifa inválida.');
    return this.repository.updateResource(companyId,kind,id,data,allowed[kind]);
  }
  createTrip(companyId:string,userId:string,data:any){
    if(!String(data.route_name||'').trim()||!data.planned_departure||!data.vehicle_id||!data.driver_id||!data.carrier_id)throw new BadRequestException('Ruta, fecha, transportista, vehículo y conductor son obligatorios.');
    if(!Array.isArray(data.order_ids)||!data.order_ids.length)throw new BadRequestException('Selecciona al menos un pedido despachado.');
    const distance=Number(data.planned_distance_km||0),duration=Number(data.planned_duration_minutes||0),cost=Number(data.estimated_cost||0);
    if(!Number.isFinite(distance)||distance<0||!Number.isInteger(duration)||duration<0||!Number.isFinite(cost)||cost<0)throw new BadRequestException('Distancia, duración y costo estimado deben ser válidos.');
    if(data.stops&&(!Array.isArray(data.stops)||data.stops.some((stop:any)=>!data.order_ids.includes(stop.order_id))))throw new BadRequestException('Las paradas deben pertenecer a los pedidos seleccionados.');
    return this.repository.createTrip(companyId,userId,{...data,order_ids:[...new Set(data.order_ids)],planned_distance_km:distance,planned_duration_minutes:duration,estimated_cost:cost});
  }
  depart(companyId:string,userId:string,id:string,data:any){return this.repository.depart(companyId,userId,id,data||{});}
  resequence(companyId:string,id:string,data:any){if(!Array.isArray(data.stop_ids))throw new BadRequestException('Envía el orden completo de las paradas.');return this.repository.resequence(companyId,id,data.stop_ids);}
  updateWindow(companyId:string,id:string,stopId:string,data:any){return this.repository.updateWindow(companyId,id,stopId,data);}
  updateStop(companyId:string,userId:string,id:string,stopId:string,data:any){
    if(!['arrived','delivered','partial','failed','rescheduled'].includes(data.status))throw new BadRequestException('Selecciona un estado de entrega válido.');
    if(['delivered','partial'].includes(data.status)&&(!Array.isArray(data.items)||!data.items.length))throw new BadRequestException('Registra cantidades entregadas para los artículos.');
    if(data.status==='failed'&&!String(data.failure_reason||'').trim())throw new BadRequestException('Describe el motivo de entrega fallida.');
    if(data.status==='rescheduled'&&!data.rescheduled_for)throw new BadRequestException('Indica la nueva fecha de entrega.');
    if(data.latitude!==undefined&&data.latitude!==null&&(Number(data.latitude)<-90||Number(data.latitude)>90))throw new BadRequestException('Latitud inválida.');
    if(data.longitude!==undefined&&data.longitude!==null&&(Number(data.longitude)<-180||Number(data.longitude)>180))throw new BadRequestException('Longitud inválida.');
    return this.repository.updateStop(companyId,userId,id,stopId,data);
  }
  addExpense(companyId:string,userId:string,id:string,data:any){
    if(!['fuel','toll','parking','per_diem','other'].includes(data.expense_type)||!String(data.description||'').trim()||!Number.isFinite(Number(data.amount))||Number(data.amount)<0)throw new BadRequestException('Tipo, descripción e importe válido son obligatorios.');
    return this.repository.addExpense(companyId,userId,id,data);
  }
  closeTrip(companyId:string,userId:string,id:string,data:any){if(!Number.isFinite(Number(data.invoiced_amount||0))||Number(data.invoiced_amount||0)<0)throw new BadRequestException('El total facturado debe ser igual o mayor que cero.');return this.repository.closeTrip(companyId,userId,id,data);}
  addIncident(companyId:string,userId:string,id:string,data:any){
    if(!['delay','damage','loss','accident','theft','vehicle','customer','other'].includes(data.incident_type)||!['low','medium','high','critical'].includes(data.severity)||!String(data.description||'').trim()||!Number.isFinite(Number(data.estimated_loss||0))||Number(data.estimated_loss||0)<0)throw new BadRequestException('Completa tipo, gravedad, descripción e importe estimado del incidente.');
    return this.repository.addIncident(companyId,userId,id,data);
  }
  resolveIncident(companyId:string,userId:string,id:string,data:any){if(!['resolved','claim'].includes(data.status))throw new BadRequestException('El incidente debe quedar resuelto o en reclamo.');return this.repository.resolveIncident(companyId,userId,id,data);}
}
