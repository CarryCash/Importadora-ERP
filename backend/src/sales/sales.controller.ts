import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { SalesService } from './sales.service';

@Controller('api/sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  // POST /api/sales — Crear venta
  @Post()
  create(@Body() dto: any) {
    return this.salesService.create(dto);
  }

  // GET /api/sales — Listar ventas
  @Get()
  findAll() {
    return this.salesService.findAll();
  }

  // GET /api/sales/summary — KPIs
  @Get('summary')
  getSummary() {
    return this.salesService.getSummary();
  }

  // GET /api/sales/:id — Detalle de venta
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  // POST /api/sales/:id/payments — Agregar pago
  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: any) {
    return this.salesService.addPayment(id, dto);
  }

  // PATCH /api/sales/:id/cancel — Cancelar venta
  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.salesService.cancel(id);
  }
}
