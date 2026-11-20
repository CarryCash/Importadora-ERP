import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { StorageService } from './storage.service';

type AuthRequest = Request & { user?: { sub: string; company_id?: string } };
@Controller('api/storage')
export class StorageController {
  constructor(private readonly service: StorageService) {}
  private company(request: AuthRequest) { return request.user?.company_id || '10000000-0000-4000-8000-000000000001'; }

  @Get('locations') @Permissions('storage.read')
  locations(@Req() req: AuthRequest, @Query('warehouseId') warehouseId?: string) { return this.service.locations(this.company(req), warehouseId); }
  @Post('locations') @Permissions('storage.write')
  createLocation(@Req() req: AuthRequest, @Body() body: any) { return this.service.createLocation(this.company(req), body); }
  @Patch('locations/:id') @Permissions('storage.write')
  updateLocation(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: any) { return this.service.updateLocation(this.company(req), id, body); }
  @Get('inventory') @Permissions('storage.read')
  inventory(@Req() req: AuthRequest, @Query('warehouseId') warehouseId?: string, @Query('search') search?: string) { return this.service.inventory(this.company(req), warehouseId, search || ''); }
  @Get('movements') @Permissions('storage.read')
  movements(@Req() req: AuthRequest, @Query('warehouseId') warehouseId?: string) { return this.service.movements(this.company(req), warehouseId); }
  @Get('suggestions') @Permissions('storage.read')
  suggestions(@Req() req: AuthRequest, @Query('inventoryId') inventoryId: string, @Query('quantity') quantity?: string, @Query('status') status?: string) { return this.service.suggestions(this.company(req), inventoryId, quantity ? Number(quantity) : 1, status || 'available'); }
  @Post('moves') @Permissions('storage.write')
  move(@Req() req: AuthRequest, @Body() body: any) { return this.service.move(this.company(req), req.user?.sub || '', body); }
  @Get('replenishment') @Permissions('storage.read')
  replenishment(@Req() req: AuthRequest, @Query('warehouseId') warehouseId?: string) { return this.service.replenishment(this.company(req), warehouseId); }
  @Get('rules') @Permissions('storage.read')
  rules(@Req() req: AuthRequest) { return this.service.rules(this.company(req)); }
  @Post('rules') @Permissions('storage.write')
  saveRule(@Req() req: AuthRequest, @Body() body: any) { return this.service.saveRule(this.company(req), body); }
  @Patch('products/:id/profile') @Permissions('storage.write')
  productProfile(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: any) { return this.service.updateProductProfile(this.company(req), id, body); }
}
