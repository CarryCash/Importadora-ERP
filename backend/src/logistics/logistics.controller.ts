import { Controller, Get, Patch, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { LogisticsService } from './logistics.service';
import { Permissions } from '../auth/permissions.decorator';

type AuthenticatedRequest = Request & { user?: { sub: string; company_id?: string } };
const legacyCompanyId = '10000000-0000-4000-8000-000000000001';

@Controller('api/logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get('configuration')
  @Permissions('logistics.read')
  getConfiguration(@Req() request: AuthenticatedRequest) {
    return this.logisticsService.getConfiguration(request.user?.company_id || legacyCompanyId);
  }

  @Patch('configuration')
  @Permissions('logistics.write')
  saveConfiguration(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.logisticsService.saveConfiguration(
      request.user?.company_id || legacyCompanyId,
      request.user?.sub || '',
      body,
    );
  }

  @Get('deliveries/upcoming')
  @Permissions('logistics.read')
  getUpcomingDeliveries() {
    return this.logisticsService.getUpcomingDeliveries();
  }

  @Get('stats')
  @Permissions('logistics.read')
  getStats() {
    return this.logisticsService.getStats();
  }

  @Patch('deliveries/:id/status')
  @Permissions('logistics.write')
  updateDeliveryStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.logisticsService.updateDeliveryStatus(id, status);
  }

  @Patch('deliveries/:id/assign')
  @Permissions('logistics.write')
  assignDriver(@Param('id') id: string, @Body() data: any) {
    return this.logisticsService.assignDriver(id, data);
  }
}
