import { Injectable } from '@nestjs/common';
import { ImportsRepository } from './imports.repository';

@Injectable()
export class ImportsService {
  constructor(private readonly repository: ImportsRepository) {}
  
  async create(dto: any,companyId:string,userId:string) {
    return this.repository.createTransaction(dto,companyId,userId);
  }

  async findAll(companyId: string) {
    return this.repository.findAll(companyId);
  }

  async getActiveContainers(companyId: string) {
    return this.repository.getActiveContainers(companyId);
  }

  async getContainersAlerts(companyId: string) {
    return this.repository.getContainersAlerts(companyId);
  }

  async updateContainer(companyId: string, id: string, data: any) {
    return this.repository.updateContainer(companyId, id, data.customs_status, data.free_days_deadline);
  }

  async findOne(companyId: string, id: string) {
    return this.repository.getImportDetail(companyId, id);
  }

  async updateStatus(companyId: string, id: string, status: string) {
    return this.repository.updateStatus(companyId, id, status);
  }

  async receiveShipment(companyId: string, id: string, actual_arrival: string) {
    return this.repository.updateArrival(companyId, id, actual_arrival);
  }
}
