import { Injectable } from '@nestjs/common';
import { ReturnsRepository } from './returns.repository';

@Injectable()
export class ReturnsService {
  constructor(private readonly repository: ReturnsRepository) {}

  async create(dto: any) {
    return this.repository.createReturn(dto);
  }

  async findAll() {
    return this.repository.findAll();
  }
}
