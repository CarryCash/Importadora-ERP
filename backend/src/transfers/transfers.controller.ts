import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { TransfersService } from './transfers.service';

type AuthRequest = Request & { user?: { sub: string; company_id?: string } };

@Controller('api/transfers')
export class TransfersController {
  constructor(private readonly service: TransfersService) {}
  private company(req: AuthRequest) { return req.user?.company_id || '10000000-0000-4000-8000-000000000001'; }

  @Get('context') @Permissions('transfers.read')
  context(@Req() req: AuthRequest) { return this.service.context(this.company(req)); }
  @Get() @Permissions('transfers.read')
  list(@Req() req: AuthRequest) { return this.service.list(this.company(req)); }
  @Get(':id') @Permissions('transfers.read')
  get(@Req() req: AuthRequest,@Param('id') id: string) { return this.service.get(this.company(req),id); }
  @Post() @Permissions('transfers.request')
  request(@Req() req: AuthRequest,@Body() body: any,@Headers('idempotency-key') key?:string) { return this.service.request(this.company(req),req.user?.sub||'',body,key); }
  @Post(':id/approve') @Permissions('transfers.approve')
  approve(@Req() req: AuthRequest,@Param('id') id: string,@Body() body: any) { return this.service.approve(this.company(req),req.user?.sub||'',id,body); }
  @Post(':id/ship') @Permissions('transfers.ship')
  ship(@Req() req: AuthRequest,@Param('id') id: string,@Body() body: any,@Headers('idempotency-key') key?:string) { return this.service.ship(this.company(req),req.user?.sub||'',id,body,key); }
  @Post(':id/receive') @Permissions('transfers.receive')
  receive(@Req() req: AuthRequest,@Param('id') id: string,@Body() body: any,@Headers('idempotency-key') key?:string) { return this.service.receive(this.company(req),req.user?.sub||'',id,body,key); }
  @Post(':id/cancel') @Permissions('transfers.cancel')
  cancel(@Req() req: AuthRequest,@Param('id') id: string,@Body() body: any) { return this.service.cancel(this.company(req),req.user?.sub||'',id,body); }
}
