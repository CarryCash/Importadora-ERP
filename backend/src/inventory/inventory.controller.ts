import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('api/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stats')
  getStats() {
    return this.inventoryService.getStats();
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.inventoryService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      search || '',
      warehouseId || '',
      status || ''
    );
  }

  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string) {
    return this.inventoryService.findByProduct(productId);
  }

  @Get('trace/:batchId')
  getTraceability(@Param('batchId') batchId: string) {
    return this.inventoryService.getTraceability(batchId);
  }

  @Get(':id/kardex')
  getKardex(@Param('id') id: string) {
    return this.inventoryService.getKardex(id);
  }

  @Post('adjustment')
  createAdjustment(@Body() data: any) {
    return this.inventoryService.createAdjustment(data);
  }

  @Post('reorder-settings/:productId')
  updateReorderSettings(@Param('productId') productId: string, @Body() data: any) {
    return this.inventoryService.updateReorderSettings(productId, data);
  }

  @Get('warehouses')
  getWarehouses() {
    return this.inventoryService.getWarehouses();
  }

  @Post('transfer')
  transferStock(@Body() data: any) {
    return this.inventoryService.transferStock(data);
  }

  @Get('forecasting')
  getForecasting() {
    return this.inventoryService.getForecasting();
  }
}
