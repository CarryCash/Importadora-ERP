import { Injectable } from '@nestjs/common';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

  async create(createProductDto: any) {
    return this.productsRepository.create(createProductDto);
  }

  async findAll() {
    return this.productsRepository.findAll();
  }

  async findOne(id: string) {
    return this.productsRepository.findById(id);
  }
}
