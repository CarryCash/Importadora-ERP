import { BadRequestException, Injectable } from '@nestjs/common';
import { LogisticsOperationsRepository } from './operations.repository';

@Injectable()
export class LogisticsOperationsService {
  constructor(private readonly repository: LogisticsOperationsRepository) {}
  returnsContext(companyId:string){return this.repository.returnsContext(companyId);}
  listReturns(companyId:string){return this.repository.listReturns(companyId);}
  createReturn(companyId:string,userId:string,data:any){
    if(!['customer','supplier'].includes(data.direction)||!String(data.reason||'').trim()||!data.warehouse_id)throw new BadRequestException('Indica el tipo, motivo y bodega física de recepción o salida.');
    if(data.direction==='customer'&&!data.sale_id)throw new BadRequestException('Selecciona la venta original.');
    if(data.direction==='supplier'&&!data.receipt_id)throw new BadRequestException('Selecciona la recepción original del proveedor.');
    if(!Array.isArray(data.items)||!data.items.length)throw new BadRequestException('Agrega artículos a devolver.');
    if(!Number.isFinite(Number(data.transport_cost||0))||Number(data.transport_cost||0)<0)throw new BadRequestException('El costo de retorno debe ser válido.');
    return this.repository.createReturn(companyId,userId,data);
  }
  authorizeReturn(companyId:string,userId:string,id:string,data:any){return this.repository.authorizeReturn(companyId,userId,id,data||{});}
  shipSupplierReturn(companyId:string,userId:string,id:string,data:any){return this.repository.shipSupplierReturn(companyId,userId,id,data||{});}
  rejectReturn(companyId:string,userId:string,id:string,data:any){if(!String(data.notes||'').trim())throw new BadRequestException('Indica por qué se rechaza la devolución.');return this.repository.rejectReturn(companyId,userId,id,data.notes);}
  receiveReturn(companyId:string,userId:string,id:string,data:any){if(!data.warehouse_id)throw new BadRequestException('Selecciona la bodega donde se recibe el producto.');return this.repository.receiveReturn(companyId,userId,id,data);}
  inspectReturn(companyId:string,userId:string,id:string,data:any){if(!Array.isArray(data.items)||!data.items.length)throw new BadRequestException('Clasifica los artículos recibidos.');return this.repository.inspectReturn(companyId,userId,id,data);}
  resolveReturn(companyId:string,userId:string,id:string,data:any){if(!['restock','repair','quarantine','scrap','replacement','refund','supplier_credit'].includes(data.resolution))throw new BadRequestException('Selecciona una resolución válida.');return this.repository.resolveReturn(companyId,userId,id,data);}
  inventoryContext(companyId:string){return this.repository.inventoryContext(companyId);}
  listCounts(companyId:string){return this.repository.listCounts(companyId);}
  countDetails(companyId:string,id:string){return this.repository.countDetails(companyId,id);}
  createCount(companyId:string,userId:string,data:any,idempotencyKey?:string){if(!data.warehouse_id||!['cycle','full'].includes(data.count_type||'cycle'))throw new BadRequestException('Selecciona la bodega y el tipo de conteo.');return this.repository.createCount(companyId,userId,data,idempotencyKey);}
  saveCount(companyId:string,userId:string,id:string,data:any,idempotencyKey?:string){return this.repository.saveCount(companyId,userId,id,data,idempotencyKey);}
  submitCount(companyId:string,userId:string,id:string){return this.repository.submitCount(companyId,userId,id);}
  reconcileCount(companyId:string,userId:string,id:string,idempotencyKey?:string){return this.repository.reconcileCount(companyId,userId,id,idempotencyKey);}
  serialTrace(companyId:string,query:string){if(!query.trim())throw new BadRequestException('Escribe un número de serie, lote o SKU para buscar.');return this.repository.serialTrace(companyId,query.trim());}
  traceInventory(companyId:string,query:string){if(!query.trim())throw new BadRequestException('Escribe el producto, SKU, lote o serie que quieres rastrear.');return this.repository.traceInventory(companyId,query.trim());}
  inventoryMovements(companyId:string){return this.repository.inventoryMovements(companyId);}
}
