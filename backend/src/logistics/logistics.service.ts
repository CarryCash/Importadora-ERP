import { Injectable } from '@nestjs/common';
import { LogisticsRepository } from './logistics.repository';

@Injectable()
export class LogisticsService {
  constructor(private readonly repository: LogisticsRepository) {}

  async getUpcomingDeliveries() {
    return this.repository.getUpcomingDeliveries();
  }

  async getStats() {
    return this.repository.getStats();
  }

  async updateDeliveryStatus(id: string, status: string) {
    return this.repository.updateDeliveryStatus(id, status);
  }

  async assignDriver(id: string, data: any) {
    return this.repository.assignDriver(id, data.driver_name, data.vehicle_plate, data.scheduled_time);
  }
}
