import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { ReceivingService } from './receiving.service';

type AuthRequest = Request & { user?: { sub: string; company_id?: string } };
const legacyCompanyId = '10000000-0000-4000-8000-000000000001';

@Controller('api/receiving')
export class ReceivingController {
  constructor(private readonly service: ReceivingService) {}
  private company(request: AuthRequest) { return request.user?.company_id || legacyCompanyId; }

  @Get('purchase-orders')
  @Permissions('receiving.read')
  listPurchaseOrders(@Req() request: AuthRequest) { return this.service.listPurchaseOrders(this.company(request)); }

  @Post('purchase-orders')
  @Permissions('receiving.create')
  createPurchaseOrder(@Req() request: AuthRequest, @Body() body: any) { return this.service.createPurchaseOrder(this.company(request),request.user?.sub||'',body); }

  @Get('sources')
  @Permissions('receiving.read')
  listSources(@Req() request: AuthRequest,@Query('type') type: string) { return this.service.listSources(this.company(request),type); }

  @Get()
  @Permissions('receiving.read')
  listReceipts(@Req() request: AuthRequest) { return this.service.listReceipts(this.company(request)); }

  @Post()
  @Permissions('receiving.create')
  createReceipt(@Req() request: AuthRequest,@Body() body: any,@Headers('idempotency-key') key?:string) { return this.service.createReceipt(this.company(request),request.user?.sub||'',body,key); }

  @Post('transfers')
  @Permissions('receiving.create')
  createTransfer(@Req() request: AuthRequest,@Body() body: any) { return this.service.createTransfer(this.company(request),request.user?.sub||'',body); }

  @Get(':id')
  @Permissions('receiving.read')
  getReceipt(@Req() request: AuthRequest,@Param('id') id: string) { return this.service.getReceipt(this.company(request),id); }

  @Patch(':id/details')
  @Permissions('receiving.create')
  updateDetails(@Req() request: AuthRequest,@Param('id') id: string,@Body() body: any) { return this.service.updateReceiptDetails(this.company(request),id,body); }

  @Patch(':id/items/:itemId')
  @Permissions('receiving.create')
  updateItem(@Req() request: AuthRequest,@Param('id') id: string,@Param('itemId') itemId: string,@Body() body: any) { return this.service.updateReceiptItem(this.company(request),id,itemId,body); }

  @Post(':id/evidence')
  @Permissions('receiving.create')
  addEvidence(@Req() request: AuthRequest,@Param('id') id: string,@Body() body: any) { return this.service.addEvidence(this.company(request),id,request.user?.sub||'',body); }

  @Post(':id/close')
  @Permissions('receiving.close')
  close(@Req() request: AuthRequest,@Param('id') id: string,@Headers('idempotency-key') key?:string) { return this.service.closeReceipt(this.company(request),id,request.user?.sub||'',key); }
}
