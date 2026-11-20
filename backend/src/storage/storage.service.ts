import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StorageRepository } from './storage.repository';

const locationTypes = new Set(['receiving','picking','storage','quarantine','cross_dock','temporary','transit','dispatch']);
const moveTypes = new Set(['putaway','relocation','replenishment','consolidation','split','cross_dock','status_change']);
@Injectable()
export class StorageService {
  constructor(private readonly repository: StorageRepository) {}
  locations(companyId: string, warehouseId?: string) { return this.repository.locations(companyId, warehouseId); }
  inventory(companyId: string, warehouseId?: string, search = '') { return this.repository.inventory(companyId, warehouseId, search); }
  movements(companyId: string, warehouseId?: string) { return this.repository.movements(companyId, warehouseId); }
  suggestions(companyId: string, inventoryId: string, quantity = 1, status = 'available') {
    if (!inventoryId) throw new BadRequestException('Selecciona una línea de inventario.');
    if (!Number.isInteger(quantity)||quantity<=0) throw new BadRequestException('La cantidad sugerida debe ser un entero mayor a cero.');
    if (!['available','quarantine','damaged','reserved'].includes(status)) throw new BadRequestException('Estado de stock inválido.');
    return this.repository.suggestions(companyId, inventoryId, quantity, status);
  }
  replenishment(companyId: string, warehouseId?: string) { return this.repository.replenishment(companyId, warehouseId); }
  rules(companyId: string) { return this.repository.rules(companyId); }
  async createLocation(companyId: string, data: any) {
    this.validateLocation(data);
    return this.repository.createLocation(companyId, data);
  }
  async updateLocation(companyId: string, id: string, data: any) {
    if (data.location_type && !locationTypes.has(data.location_type)) throw new BadRequestException('Tipo de ubicación inválido.');
    if (data.status && !['active','blocked'].includes(data.status)) throw new BadRequestException('Estado de ubicación inválido.');
    const location = await this.repository.updateLocation(companyId, id, data);
    if (!location) throw new NotFoundException('No existe la ubicación solicitada.');
    return location;
  }
  async move(companyId: string, userId: string, data: any) {
    const quantity = Number(data.quantity);
    if (!data.inventory_id || !data.target_location_id || !Number.isInteger(quantity) || quantity <= 0) throw new BadRequestException('Indica inventario, ubicación destino y una cantidad entera válida.');
    const movementType = data.movement_type || 'relocation';
    if (!moveTypes.has(movementType)) throw new BadRequestException('Tipo de movimiento inválido.');
    const targetStatus = data.target_status || 'available';
    if (!['available','quarantine','damaged','reserved'].includes(targetStatus)) throw new BadRequestException('Estado de stock inválido.');
    return this.repository.move(companyId, userId, { ...data, quantity, movement_type: movementType, target_status: targetStatus });
  }
  async saveRule(companyId: string, data: any) {
    if (!String(data.name || '').trim() || (!data.product_id && !String(data.category || '').trim())) throw new BadRequestException('La regla necesita nombre y producto o categoría.');
    if (data.required_location_type && !locationTypes.has(data.required_location_type)) throw new BadRequestException('Tipo de ubicación inválido.');
    return this.repository.saveRule(companyId, data);
  }
  async updateProductProfile(companyId: string, id: string, data: any) {
    const profile = {
      weight_kg: this.nonNegative(data.weight_kg, 'Peso'),
      volume_m3: this.nonNegative(data.volume_m3, 'Volumen'),
      units_per_pallet: Number(data.units_per_pallet ?? 1),
      is_hazardous: Boolean(data.is_hazardous),
      hazard_class: data.hazard_class ? String(data.hazard_class).trim().slice(0, 40) : null,
    };
    if (profile.units_per_pallet <= 0 || !Number.isFinite(profile.units_per_pallet)) throw new BadRequestException('Unidades por pallet debe ser mayor que cero.');
    const result = await this.repository.updateProductProfile(companyId, id, profile);
    if (!result) throw new NotFoundException('No existe el producto solicitado.');
    return result;
  }
  private validateLocation(data: any) {
    if (!data.warehouse_id || !String(data.code || '').trim() || !String(data.name || '').trim()) throw new BadRequestException('Bodega, código y nombre son obligatorios.');
    if (data.location_type && !locationTypes.has(data.location_type)) throw new BadRequestException('Tipo de ubicación inválido.');
    for (const field of ['capacity_units','capacity_weight_kg','capacity_volume_m3','capacity_pallets','pick_minimum','pick_maximum']) this.nonNegative(data[field] ?? 0, field);
    if (Number(data.pick_maximum || 0) < Number(data.pick_minimum || 0)) throw new BadRequestException('El máximo de picking debe ser igual o mayor al mínimo.');
  }
  private nonNegative(value: any, label: string) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number) || number < 0) throw new BadRequestException(`${label} debe ser un número igual o mayor que cero.`);
    return number;
  }
}
