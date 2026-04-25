import { Injectable } from '@nestjs/common';
import { SuppliersRepository } from './suppliers.repository';

@Injectable()
export class SuppliersService {
  constructor(private readonly repository: SuppliersRepository) {}
  
  async create(supplier: any) {
    return this.repository.create(supplier);
  }

  async update(id: string, supplier: any) {
    return this.repository.update(id, supplier);
  }

  async findAll() {
    return this.repository.findAll();
  }

  async findOne(id: string) {
    return this.repository.findById(id);
  }
}
