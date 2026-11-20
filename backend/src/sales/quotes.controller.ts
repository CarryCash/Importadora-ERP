import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { Permissions } from '../auth/permissions.decorator';

@Controller('api/sales/quotes')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Post()
  @Permissions('sales.create')
  create(@Body() dto: any,@Req() req:any) {
    return this.service.create(dto,req.user.company_id,req.user.sub,req.user.branch_id,req.user.roles||[]);
  }

  @Get()
  @Permissions('sales.read')
  findAll(@Req() req:any) {
    return this.service.findAll(req.user.company_id);
  }
}
