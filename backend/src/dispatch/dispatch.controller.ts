import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { DispatchService } from './dispatch.service';

type AuthRequest = Request & { user?: { sub: string; company_id?: string } };
@Controller('api/dispatch')
export class DispatchController {
  constructor(private readonly service: DispatchService) {}
  private company(req: AuthRequest) { return req.user?.company_id || '10000000-0000-4000-8000-000000000001'; }

  @Get('sales') @Permissions('dispatch.read')
  sales(@Req() req: AuthRequest) { return this.service.sales(this.company(req)); }
  @Get('orders') @Permissions('dispatch.read')
  orders(@Req() req: AuthRequest,@Query('status') status?: string) { return this.service.orders(this.company(req),status); }
  @Post('orders') @Permissions('dispatch.manage')
  createOrder(@Req() req: AuthRequest,@Body() body: any) { return this.service.createOrder(this.company(req),req.user?.sub||'',body); }
  @Get('orders/:id') @Permissions('dispatch.read')
  order(@Req() req: AuthRequest,@Param('id') id: string) { return this.service.order(this.company(req),id); }
  @Post('waves') @Permissions('dispatch.manage')
  createWave(@Req() req: AuthRequest,@Body() body: any) { return this.service.createWave(this.company(req),req.user?.sub||'',body); }
  @Get('waves') @Permissions('dispatch.read')
  waves(@Req() req: AuthRequest) { return this.service.waves(this.company(req)); }
  @Get('waves/:id') @Permissions('dispatch.read')
  wave(@Req() req: AuthRequest,@Param('id') id: string) { return this.service.wave(this.company(req),id); }
  @Post('waves/:id/pick') @Permissions('dispatch.pick')
  pick(@Req() req: AuthRequest,@Param('id') id: string,@Body() body: any) { return this.service.pick(this.company(req),req.user?.sub||'',id,body); }
  @Post('orders/:id/packages') @Permissions('dispatch.pack')
  createPackage(@Req() req: AuthRequest,@Param('id') id: string,@Body() body: any) { return this.service.createPackage(this.company(req),req.user?.sub||'',id,body); }
  @Patch('orders/:id/checklist/:key') @Permissions('dispatch.pack')
  checklist(@Req() req: AuthRequest,@Param('id') id: string,@Param('key') key: string,@Body() body: any) { return this.service.updateChecklist(this.company(req),req.user?.sub||'',id,key,body); }
  @Post('orders/:id/evidence') @Permissions('dispatch.pack')
  evidence(@Req() req: AuthRequest,@Param('id') id: string,@Body() body: any) { return this.service.addEvidence(this.company(req),req.user?.sub||'',id,body); }
  @Post('orders/:id/dispatch') @Permissions('dispatch.confirm')
  dispatch(@Req() req: AuthRequest,@Param('id') id: string,@Body() body: any,@Headers('idempotency-key') key?:string) { return this.service.dispatch(this.company(req),req.user?.sub||'',id,body,key); }
}
