import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesRepository } from './sales.repository';

@Injectable()
export class SalesService {
  constructor(private readonly repository: SalesRepository) {}

  async create(dto: any) {
    return this.repository.createTransaction(dto);
  }

  async findAll() {
    return this.repository.findAll();
  }

  async findOne(id: string) {
    return this.repository.findById(id);
  }

  async addPayment(saleId: string, dto: any) {
    if (!dto.method || !dto.amount) {
      throw new BadRequestException('Se requiere método y monto de pago.');
    }
    return this.repository.addPayment(saleId, dto);
  }

  async cancel(id: string) {
    return this.repository.cancel(id);
  }

  async getSummary() {
    return this.repository.getSummary();
  }
}
