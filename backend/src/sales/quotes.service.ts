import { Injectable } from '@nestjs/common';
import { QuotesRepository } from './quotes.repository';

@Injectable()
export class QuotesService {
  constructor(private readonly repository: QuotesRepository) {}

  async create(dto: any,companyId:string,userId:string,branchId:string|null,userRoles:string[]) {
    return this.repository.create(dto,companyId,userId,branchId,userRoles);
  }

  async findAll(companyId:string) {
    return this.repository.findAll(companyId);
  }
}
