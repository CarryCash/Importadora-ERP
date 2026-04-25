import { Controller, Get, Post, Body } from '@nestjs/common';
import { ReturnsService } from './returns.service';

@Controller('api/sales/returns')
export class ReturnsController {
  constructor(private readonly service: ReturnsService) {}

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
