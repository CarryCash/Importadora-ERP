import { Controller, Get, Post, Body } from '@nestjs/common';
import { QuotesService } from './quotes.service';

@Controller('api/sales/quotes')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
