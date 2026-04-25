import { Injectable } from '@nestjs/common';
import { QuotesRepository } from './quotes.repository';

@Injectable()
export class QuotesService {
  constructor(private readonly repository: QuotesRepository) {}

  async create(dto: any) {
    return this.repository.create(dto);
  }

  async findAll() {
    return this.repository.findAll();
  }
}
