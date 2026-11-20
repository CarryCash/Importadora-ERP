import { BadRequestException, Injectable } from '@nestjs/common';
import { TransfersRepository } from './transfers.repository';

@Injectable()
export class TransfersService {
  constructor(private readonly repository: TransfersRepository) {}
  context(companyId: string) { return this.repository.context(companyId); }
  list(companyId: string) { return this.repository.list(companyId); }
  get(companyId: string,id: string) { return this.repository.get(companyId,id); }
  request(companyId: string,userId: string,data: any,idempotencyKey?:string) {
    if(!data.from_warehouse_id||!data.to_warehouse_id||!data.to_location_id) throw new BadRequestException('Selecciona bodega de origen, bodega y ubicación de destino.');
    if(!String(data.reason||'').trim()) throw new BadRequestException('Escribe el motivo de la transferencia.');
    if(!Array.isArray(data.items)||!data.items.length||data.items.some((item:any)=>!item.inventory_id||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<=0)) throw new BadRequestException('Agrega artículos con cantidades enteras mayores que cero.');
    return this.repository.request(companyId,userId,{...data,reason:String(data.reason).trim(),items:data.items.map((item:any)=>({...item,quantity:Number(item.quantity)}))},idempotencyKey);
  }
  approve(companyId: string,userId: string,id: string,data: any) { return this.repository.approve(companyId,userId,id,data||{}); }
  ship(companyId: string,userId: string,id: string,data: any,idempotencyKey?:string) {
    if(!Array.isArray(data.items)||!data.items.length||data.items.some((item:any)=>!item.transfer_item_id||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<=0)) throw new BadRequestException('Indica los artículos y cantidades enteras que salen de origen.');
    return this.repository.ship(companyId,userId,id,{...data,items:data.items.map((item:any)=>({...item,quantity:Number(item.quantity)}))},idempotencyKey);
  }
  receive(companyId: string,userId: string,id: string,data: any,idempotencyKey?:string) {
    if(!Array.isArray(data.items)||!data.items.length||data.items.some((item:any)=>!item.transfer_item_id||![item.received_quantity,item.damaged_quantity,item.lost_quantity].every((value:any)=>Number.isInteger(Number(value??0))&&Number(value??0)>=0)||Number(item.received_quantity||0)+Number(item.damaged_quantity||0)+Number(item.lost_quantity||0)<=0)) throw new BadRequestException('Registra por artículo unidades recibidas, dañadas o perdidas.');
    return this.repository.receive(companyId,userId,id,{...data,items:data.items.map((item:any)=>({...item,received_quantity:Number(item.received_quantity||0),damaged_quantity:Number(item.damaged_quantity||0),lost_quantity:Number(item.lost_quantity||0)}))},idempotencyKey);
  }
  cancel(companyId: string,userId: string,id: string,data: any) { return this.repository.cancel(companyId,userId,id,data||{}); }
}
