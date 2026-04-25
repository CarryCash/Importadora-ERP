import { Controller, Get } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('api/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.reportsService.getDashboardData();
  }

  @Get('customers')
  async getCustomerAnalytics() {
    return this.reportsService.getDashboardData(); // Reuse or split if needed, but for now this works as it contains customer data
  }
}
