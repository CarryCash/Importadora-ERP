import { BadRequestException, Injectable } from '@nestjs/common';
import { ReceivingRepository } from './receiving.repository';

@Injectable()
export class ReceivingService {
  constructor(private readonly repository: ReceivingRepository) {}

  listPurchaseOrders(companyId: string) { return this.repository.listPurchaseOrders(companyId); }
  listReceipts(companyId: string) { return this.repository.listReceipts(companyId); }
  getReceipt(companyId: string, id: string) { return this.repository.getReceipt(companyId, id); }
  listSources(companyId: string, sourceType: string) { return this.repository.listSources(companyId, sourceType); }
  closeReceipt(companyId: string, id: string, userId: string, idempotencyKey?:string) { return this.repository.closeReceipt(companyId,id,userId,idempotencyKey); }

  async createPurchaseOrder(companyId: string, userId: string, data: any) {
    if (!data?.supplier_id || !Array.isArray(data.items) || !data.items.length) throw new BadRequestException('Selecciona proveedor y al menos un producto.');
    this.validateItems(data.items);
    return this.repository.createPurchaseOrder(companyId,userId,data);
  }

  async createReceipt(companyId: string, userId: string, data: any, idempotencyKey?:string) {
    if (!['purchase_order','import','transfer','manual'].includes(data?.source_type)) throw new BadRequestException('Tipo de origen no válido.');
    if (!data.target_warehouse_id) throw new BadRequestException('Selecciona la bodega de destino.');
    if (data.source_type === 'manual') {
      if (!Array.isArray(data.items) || !data.items.length) throw new BadRequestException('Agrega al menos un producto esperado.');
      this.validateItems(data.items, true);
    } else if (!data.source_id) throw new BadRequestException('Selecciona el documento de origen.');
    return this.repository.createReceipt(companyId,userId,data,idempotencyKey);
  }

  async createTransfer(companyId: string, userId: string, data: any) {
    if (!data.origin_warehouse_id || !data.target_warehouse_id || !Array.isArray(data.items) || !data.items.length) throw new BadRequestException('Completa las bodegas y productos de la transferencia.');
    for (const item of data.items) if (!item.inventory_id || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) throw new BadRequestException('Cada línea requiere un inventario y una cantidad entera mayor a cero.');
    return this.repository.createTransfer(companyId,userId,data);
  }

  async updateReceiptItem(companyId: string, receiptId: string, itemId: string, data: any) {
    const received = Number(data.received_quantity);
    const damaged = Number(data.damaged_quantity || 0);
    if (!Number.isInteger(received) || received < 0 || !Number.isInteger(damaged) || damaged < 0 || damaged > received) throw new BadRequestException('Revisa las cantidades recibidas y dañadas.');
    if (!['pending','approved','rejected','hold'].includes(data.quality_status)) throw new BadRequestException('Selecciona un resultado de inspección válido.');
    if (data.serial_numbers !== undefined && (!Array.isArray(data.serial_numbers) || data.serial_numbers.some((serial: unknown) => typeof serial !== 'string'))) throw new BadRequestException('Los números de serie deben ser una lista de texto.');
    return this.repository.updateReceiptItem(companyId,receiptId,itemId,{...data,received_quantity:received,damaged_quantity:damaged});
  }

  async addEvidence(companyId: string, receiptId: string, userId: string, data: any) {
    const allowed = ['image/png','image/jpeg','image/webp','application/pdf'];
    if (!data?.file_name || typeof data.file_name !== 'string' || !allowed.includes(data.mime_type) ||
      typeof data.data_url !== 'string' || !data.data_url.startsWith(`data:${data.mime_type};base64,`) || data.data_url.length > 1_500_000) {
      throw new BadRequestException('Adjunta una imagen PNG/JPG/WEBP o PDF de hasta 1 MB.');
    }
    return this.repository.addEvidence(companyId,receiptId,userId,data);
  }

  async updateReceiptDetails(companyId: string, id: string, data: any) {
    if (data.vehicle_plate && String(data.vehicle_plate).length > 20) throw new BadRequestException('La placa no puede superar 20 caracteres.');
    return this.repository.updateReceiptDetails(companyId,id,data);
  }

  private validateItems(items: any[], manual = false) {
    for (const item of items) {
      if (!item?.product_id) throw new BadRequestException('Cada línea debe tener un producto.');
      const quantity = Number(manual ? item.expected_quantity : item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new BadRequestException('Las cantidades deben ser enteros mayores a cero.');
      const cost = Number(item.unit_cost || 0);
      if (!Number.isFinite(cost) || cost < 0) throw new BadRequestException('El costo unitario no puede ser negativo.');
    }
  }
}
