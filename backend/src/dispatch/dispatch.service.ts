import { BadRequestException, Injectable } from '@nestjs/common';
import { DispatchRepository } from './dispatch.repository';

@Injectable()
export class DispatchService {
  constructor(private readonly repository: DispatchRepository) {}
  sales(companyId:string) { return this.repository.sales(companyId); }
  orders(companyId:string,status?:string) { return this.repository.orders(companyId,status); }
  order(companyId:string,id:string) { return this.repository.order(companyId,id); }
  waves(companyId:string) { return this.repository.waves(companyId); }
  wave(companyId:string,id:string) { return this.repository.wave(companyId,id); }
  createOrder(companyId:string,userId:string,data:any) {
    if(!data.sale_id) throw new BadRequestException('Selecciona una venta para preparar.');
    if(data.picking_strategy&&!['fifo','fefo'].includes(data.picking_strategy)) throw new BadRequestException('La estrategia debe ser FIFO o FEFO.');
    if(data.priority&&!['low','normal','high','urgent'].includes(data.priority)) throw new BadRequestException('Prioridad inválida.');
    return this.repository.createOrder(companyId,userId,data);
  }
  createWave(companyId:string,userId:string,data:any) {
    if(!Array.isArray(data.order_ids)||data.order_ids.length===0) throw new BadRequestException('Selecciona uno o más pedidos para la ola.');
    if(data.picking_strategy&&!['fifo','fefo'].includes(data.picking_strategy)) throw new BadRequestException('La estrategia debe ser FIFO o FEFO.');
    return this.repository.createWave(companyId,userId,data);
  }
  pick(companyId:string,userId:string,waveId:string,data:any) {
    if(!data.wave_item_id||!Number.isInteger(Number(data.quantity))||Number(data.quantity)<=0) throw new BadRequestException('Indica una línea y una cantidad entera válida.');
    return this.repository.pick(companyId,userId,waveId,{...data,quantity:Number(data.quantity)});
  }
  createPackage(companyId:string,userId:string,orderId:string,data:any) {
    if(!['box','bundle','pallet','container'].includes(data.package_type)) throw new BadRequestException('Selecciona caja, bulto, pallet o contenedor.');
    if(!Array.isArray(data.items)||!data.items.length) throw new BadRequestException('Agrega artículos y cantidades a este paquete.');
    if(Number(data.weight_kg)<0||Number(data.volume_m3)<0) throw new BadRequestException('Peso y volumen no pueden ser negativos.');
    return this.repository.createPackage(companyId,userId,orderId,data);
  }
  updateChecklist(companyId:string,userId:string,orderId:string,key:string,data:any) {
    if(typeof data.is_complete!=='boolean') throw new BadRequestException('Indica si el control está completo.');
    return this.repository.updateChecklist(companyId,userId,orderId,key,data.is_complete);
  }
  addEvidence(companyId:string,userId:string,orderId:string,data:any) {
    if(!String(data.file_name||'').trim()||!['photo','document','signed_delivery','other'].includes(data.evidence_type)) throw new BadRequestException('Indica el tipo y nombre de la evidencia.');
    return this.repository.addEvidence(companyId,userId,orderId,data);
  }
  dispatch(companyId:string,userId:string,orderId:string,data:any,idempotencyKey?:string) {
    if(!Array.isArray(data.items)||!data.items.length||data.items.some((item:any)=>!item.fulfillment_item_id||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<=0)) throw new BadRequestException('Indica los artículos y cantidades enteras de esta salida.');
    return this.repository.dispatch(companyId,userId,orderId,data,idempotencyKey);
  }
}
