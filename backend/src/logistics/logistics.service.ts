import { BadRequestException, Injectable } from '@nestjs/common';
import { LogisticsRepository } from './logistics.repository';

@Injectable()
export class LogisticsService {
  constructor(private readonly repository: LogisticsRepository) {}

  private readonly configSections = [
    'facilities', 'locations', 'docks', 'handlingUnits', 'unitConversions',
    'storageRules', 'schedules', 'serviceAreas', 'documentSeries', 'policies',
  ];

  async getConfiguration(companyId: string) {
    const configuration = await this.repository.getConfiguration(companyId);
    return Object.fromEntries(this.configSections.map((section) => [
      section,
      Array.isArray(configuration[section]) ? configuration[section] : [],
    ]));
  }

  async saveConfiguration(companyId: string, userId: string, input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('La configuración logística debe ser un objeto válido.');
    }
    const source = input as Record<string, unknown>;
    const configuration: Record<string, unknown[]> = {};
    for (const section of this.configSections) {
      const rows = source[section] ?? [];
      if (!Array.isArray(rows) || rows.length > 1000 || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
        throw new BadRequestException(`La sección ${section} tiene un formato inválido.`);
      }
      configuration[section] = rows.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
          if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
          if (typeof value === 'string') clean[key] = value.trim().slice(0, 500);
          else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
          else if (typeof value === 'boolean' || value === null) clean[key] = value;
        }
        return clean;
      });
    }
    return this.repository.saveConfiguration(companyId, userId, configuration);
  }

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
