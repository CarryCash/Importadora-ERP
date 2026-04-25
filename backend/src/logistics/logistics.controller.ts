import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { LogisticsService } from './logistics.service';

@Controller('api/logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get('deliveries/upcoming')
  getUpcomingDeliveries() {
    return this.logisticsService.getUpcomingDeliveries();
  }

  @Get('stats')
  getStats() {
    return this.logisticsService.getStats();
  }

  @Patch('deliveries/:id/status')
  updateDeliveryStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.logisticsService.updateDeliveryStatus(id, status);
  }

  @Patch('deliveries/:id/assign')
  assignDriver(@Param('id') id: string, @Body() data: any) {
    return this.logisticsService.assignDriver(id, data);
  }
}
