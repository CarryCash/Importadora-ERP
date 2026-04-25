import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { ImportsService } from './imports.service';

@Controller('api/imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  create(@Body() dto: any) {
    return this.importsService.create(dto);
  }

  @Get()
  findAll() {
    return this.importsService.findAll();
  }

  @Get('containers/active')
  getActiveContainers() {
    return this.importsService.getActiveContainers();
  }

  @Get('containers/alerts')
  getContainersAlerts() {
    return this.importsService.getContainersAlerts();
  }

  @Patch('containers/:id')
  updateContainer(@Param('id') id: string, @Body() data: any) {
    return this.importsService.updateContainer(id, data);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.importsService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.importsService.updateStatus(id, status);
  }

  @Patch(':id/receive')
  receiveShipment(@Param('id') id: string, @Body('actual_arrival') actual_arrival: string) {
    return this.importsService.receiveShipment(id, actual_arrival);
  }
}
