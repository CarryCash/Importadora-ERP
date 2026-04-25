import { Injectable } from '@nestjs/common';
import { CustomersRepository } from './customers.repository';

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}
  
  async create(dto: any) {
    return this.repository.create(dto);
  }

  async findAll() {
    return this.repository.findAll();
  }

  async findOne(id: string) {
    return this.repository.findById(id);
  }

  async update(id: string, dto: any) {
    return this.repository.update(id, dto);
  }

  async remove(id: string) {
    return this.repository.delete(id);
  }

  async getStatement(id: string) {
    return this.repository.getStatement(id);
  }
}
