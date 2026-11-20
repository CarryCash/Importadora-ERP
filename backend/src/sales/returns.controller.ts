import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { ReturnsService } from './returns.service';
import { Permissions } from '../auth/permissions.decorator';

@Controller('api/sales/returns')
export class ReturnsController {
  constructor(private readonly service: ReturnsService) {}

  @Get()
  @Permissions('sales.read')
  findAll(@Req() request:Request&{user?:{company_id?:string}}) {
    return this.service.findAll(request.user?.company_id||'10000000-0000-4000-8000-000000000001');
  }
}
