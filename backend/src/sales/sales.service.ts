import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesRepository } from './sales.repository';

@Injectable()
export class SalesService {
  constructor(private readonly repository: SalesRepository) {}

  async create(dto: any) {
    return this.repository.createTransaction(dto);
  }

  async findAll(companyId:string,branchId?:string|null) {
    return this.repository.findAll(companyId,branchId);
  }

  async findOne(companyId:string,id: string,branchId?:string|null) {
    return this.repository.findById(companyId,id,branchId);
  }

  async addPayment(companyId:string,saleId: string, dto: any,branchId?:string|null) {
    if (!dto.method || !dto.amount) {
      throw new BadRequestException('Se requiere método y monto de pago.');
    }
    return this.repository.addPayment(companyId,saleId, dto,branchId);
  }

  async cancel(companyId:string,id: string,branchId?:string|null) {
    return this.repository.cancel(companyId,id,branchId);
  }

  async getSummary(companyId:string,branchId?:string|null) {
    return this.repository.getSummary(companyId,branchId);
  }
}
