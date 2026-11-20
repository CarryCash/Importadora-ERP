import { Controller, Get, Post, Body, Param, Patch, Req } from '@nestjs/common';
import { ImportsService } from './imports.service';
import { Permissions } from '../auth/permissions.decorator';

@Controller('api/imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @Permissions('imports.write')
  create(@Body() dto: any,@Req() req:any) {
    return this.importsService.create(dto,req.user.company_id,req.user.sub);
  }

  @Get()
  @Permissions('imports.read')
  findAll(@Req() req: any) {
    return this.importsService.findAll(req.user.company_id);
  }

  @Get('containers/active')
  @Permissions('imports.read')
  getActiveContainers(@Req() req: any) {
    return this.importsService.getActiveContainers(req.user.company_id);
  }

  @Get('containers/alerts')
  @Permissions('imports.read')
  getContainersAlerts(@Req() req: any) {
    return this.importsService.getContainersAlerts(req.user.company_id);
  }

  @Patch('containers/:id')
  @Permissions('imports.write')
  updateContainer(@Param('id') id: string, @Body() data: any, @Req() req: any) {
    return this.importsService.updateContainer(req.user.company_id, id, data);
  }

  @Get(':id')
  @Permissions('imports.read')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.importsService.findOne(req.user.company_id, id);
  }

  @Patch(':id/status')
  @Permissions('imports.write')
  updateStatus(@Param('id') id: string, @Body('status') status: string, @Req() req: any) {
    return this.importsService.updateStatus(req.user.company_id, id, status);
  }

  @Patch(':id/receive')
  @Permissions('imports.receive')
  receiveShipment(@Param('id') id: string, @Body('actual_arrival') actual_arrival: string, @Req() req: any) {
    return this.importsService.receiveShipment(req.user.company_id, id, actual_arrival);
  }
}
