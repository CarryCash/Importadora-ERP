import { Injectable } from '@nestjs/common';
import { ImportsRepository } from './imports.repository';

@Injectable()
export class ImportsService {
  constructor(private readonly repository: ImportsRepository) {}
  
  async create(dto: any) {
    return this.repository.createTransaction(dto);
  }

  async findAll() {
    return this.repository.findAll();
  }

  async getActiveContainers() {
    return this.repository.getActiveContainers();
  }

  async getContainersAlerts() {
    return this.repository.getContainersAlerts();
  }

  async updateContainer(id: string, data: any) {
    return this.repository.updateContainer(id, data.customs_status, data.free_days_deadline);
  }

  async findOne(id: string) {
    return this.repository.getImportDetail(id);
  }

  async updateStatus(id: string, status: string) {
    return this.repository.updateStatus(id, status);
  }

  async receiveShipment(id: string, actual_arrival: string) {
    return this.repository.updateArrival(id, actual_arrival);
  }
}
