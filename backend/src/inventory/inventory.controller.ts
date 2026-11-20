import { Controller, Get, Post, Put, Body, Param, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { InventoryService } from './inventory.service';
import { Permissions } from '../auth/permissions.decorator';

type InventoryRequest = Request & {
  user?: {
    sub: string;
    company_id: string;
    branch_id?: string;
    assigned_warehouse_id?: string;
    roles?: string[];
  };
};

@Controller('api/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stats')
  @Permissions('inventory.read')
  getStats(@Req() request: InventoryRequest) {
    const scope = this.scope(request.user!);
    return this.inventoryService.getStats(request.user!.company_id, scope.branchId, scope.warehouseId);
  }

  @Get('product-totals')
  @Permissions('inventory.read')
  getProductTotals(@Req() request: InventoryRequest) {
    const scope = this.scope(request.user!);
    return this.inventoryService.getProductTotals(request.user!.company_id, scope.branchId, scope.warehouseId);
  }

  @Get('balances')
  @Permissions('inventory.read')
  findBalances(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Req() request?: InventoryRequest,
  ) {
    const scope = this.scope(request!.user!);
    return this.inventoryService.findBalances(request!.user!.company_id, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search: search || '',
      warehouseId: warehouseId || '',
      locationId: locationId || '',
      status: status || '',
      branchId: scope.branchId,
      restrictedWarehouseId: scope.warehouseId,
    });
  }

  @Get('balances/product/:productId')
  @Permissions('inventory.read')
  getProduct360(@Param('productId') productId: string, @Req() request: InventoryRequest) {
    const scope = this.scope(request.user!);
    return this.inventoryService.getProduct360(
      request.user!.company_id,
      productId,
      scope.branchId,
      scope.warehouseId,
    );
  }

  @Get('cost-layers')
  @Permissions('inventory.read')
  getCostLayers(
    @Query('productId') productId?: string,
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
    @Req() request?: InventoryRequest,
  ) {
    return this.inventoryService.getCostLayers(
      request!.user!.company_id,
      productId,
      status,
      warehouseId,
    );
  }

  @Get('valuation')
  @Permissions('inventory.read')
  getValuation(@Query('warehouseId') warehouseId?: string, @Req() request?: InventoryRequest) {
    return this.inventoryService.getValuation(request!.user!.company_id, warehouseId);
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('inventory.adjust')
  executeMovement(@Body() body: any, @Req() request: InventoryRequest) {
    return this.inventoryService.executeMovement({
      ...body,
      companyId: request.user!.company_id,
      userId: request.user!.sub,
    });
  }

  @Get()
  @Permissions('inventory.read')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
    @Req() request?: InventoryRequest,
  ) {
    const scope = this.scope(request!.user!);
    return this.inventoryService.findAll(
      request!.user!.company_id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      search || '',
      warehouseId || '',
      status || '',
      scope.branchId,
      scope.warehouseId,
    );
  }

  @Get('product/:productId')
  @Permissions('inventory.read')
  findByProduct(@Param('productId') productId: string, @Req() request: InventoryRequest) {
    const scope = this.scope(request.user!);
    return this.inventoryService.findByProduct(
      request.user!.company_id,
      productId,
      scope.branchId,
      scope.warehouseId,
    );
  }

  @Get('trace/:batchId')
  @Permissions('inventory.read')
  getTraceability(@Param('batchId') batchId: string, @Req() request: InventoryRequest) {
    return this.inventoryService.getTraceability(
      request.user!.company_id,
      batchId,
      this.scope(request.user!).branchId,
    );
  }

  @Get(':id/kardex')
  @Permissions('inventory.read')
  getKardex(@Param('id') id: string, @Req() request: InventoryRequest) {
    const scope = this.scope(request.user!);
    return this.inventoryService.getKardex(
      request.user!.company_id,
      id,
      scope.warehouseId,
    );
  }

  @Post('adjustment')
  @Permissions('inventory.adjust')
  createAdjustment(@Body() data: any, @Req() request: InventoryRequest) {
    const scope = this.scope(request.user!);
    return this.inventoryService.createAdjustment({
      ...data,
      created_by: request.user!.sub,
      company_id: request.user!.company_id,
      branch_id: scope.branchId,
      restricted_warehouse_id: scope.warehouseId,
    });
  }

  @Post('reorder-settings/:productId')
  @Permissions('inventory.reorder')
  updateReorderSettings(@Param('productId') productId: string, @Body() data: any, @Req() request: InventoryRequest) {
    return this.inventoryService.updateReorderSettings(request.user!.company_id, productId, data);
  }

  @Get('warehouses')
  @Permissions('inventory.read')
  getWarehouses(@Req() request: InventoryRequest) {
    const scope = this.scope(request.user!);
    return this.inventoryService.getWarehouses(request.user?.company_id, scope.branchId, scope.warehouseId);
  }

  @Post('transfer')
  @Permissions('inventory.transfer')
  transferStock(@Body() data: any, @Req() request: InventoryRequest) {
    const scope = this.scope(request.user!);
    return this.inventoryService.transferStock({
      ...data,
      company_id: request.user!.company_id,
      branch_id: scope.branchId,
      restricted_warehouse_id: scope.warehouseId,
    });
  }

  @Get('forecasting')
  @Permissions('inventory.read')
  getForecasting(@Req() request: InventoryRequest) {
    const scope = this.scope(request.user!);
    return this.inventoryService.getForecasting(request.user!.company_id, scope.branchId, scope.warehouseId);
  }

  // ─── ENDPOINTS DE CONTEOS FÍSICOS Y CONGELAMIENTO TRANSACCIONAL ───────────

  @Get('counts')
  @Permissions('inventory.read')
  listCounts(@Query('warehouseId') warehouseId?: string, @Req() request?: InventoryRequest) {
    return this.inventoryService.listCounts(request!.user!.company_id, warehouseId);
  }

  @Get('counts/:id')
  @Permissions('inventory.read')
  getCount(@Param('id') id: string, @Req() request: InventoryRequest) {
    return this.inventoryService.getCount(request.user!.company_id, id);
  }

  @Post('counts')
  @Permissions('inventory.adjust')
  createCount(@Body() data: any, @Req() request: InventoryRequest) {
    return this.inventoryService.createCount(request.user!.company_id, request.user!.sub, data);
  }

  @Put('counts/:id/lines')
  @Permissions('inventory.adjust')
  updateCountLines(@Param('id') id: string, @Body() body: { lines: any[] }, @Req() request: InventoryRequest) {
    return this.inventoryService.updateCountLines(request.user!.company_id, id, request.user!.sub, body.lines);
  }

  @Post('counts/:id/reconcile')
  @Permissions('inventory.adjust')
  reconcileCount(@Param('id') id: string, @Body() body: { notes?: string }, @Req() request: InventoryRequest) {
    return this.inventoryService.reconcileCount(request.user!.company_id, id, request.user!.sub, body.notes);
  }

  private scope(user: NonNullable<InventoryRequest['user']>) {
    const global = user.roles?.some((role) => ['admin', 'erp_admin'].includes(role));
    return {
      branchId: global ? null : user.branch_id || null,
      warehouseId: global ? null : user.assigned_warehouse_id || null,
    };
  }
}
