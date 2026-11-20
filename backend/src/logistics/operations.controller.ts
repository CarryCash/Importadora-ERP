import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { LogisticsOperationsService } from './operations.service';

type AuthRequest=Request&{user?:{sub:string;company_id?:string}};
const legacyCompanyId='10000000-0000-4000-8000-000000000001';

@Controller('api/logistics')
export class LogisticsOperationsController{
  constructor(private readonly service:LogisticsOperationsService){}
  private company(req:AuthRequest){return req.user?.company_id||legacyCompanyId;}
  @Get('returns/context') @Permissions('returns.read') returnsContext(@Req() req:AuthRequest){return this.service.returnsContext(this.company(req));}
  @Get('returns') @Permissions('returns.read') returns(@Req() req:AuthRequest){return this.service.listReturns(this.company(req));}
  @Post('returns') @Permissions('returns.manage') createReturn(@Req() req:AuthRequest,@Body() body:any){return this.service.createReturn(this.company(req),req.user?.sub||'',body);}
  @Patch('returns/:id/authorize') @Permissions('returns.manage') authorizeReturn(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.authorizeReturn(this.company(req),req.user?.sub||'',id,body);}
  @Post('returns/:id/ship-to-supplier') @Permissions('returns.resolve') shipSupplierReturn(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.shipSupplierReturn(this.company(req),req.user?.sub||'',id,body);}
  @Patch('returns/:id/reject') @Permissions('returns.manage') rejectReturn(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.rejectReturn(this.company(req),req.user?.sub||'',id,body);}
  @Patch('returns/:id/receive') @Permissions('returns.receive') receiveReturn(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.receiveReturn(this.company(req),req.user?.sub||'',id,body);}
  @Patch('returns/:id/inspect') @Permissions('returns.receive') inspectReturn(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.inspectReturn(this.company(req),req.user?.sub||'',id,body);}
  @Patch('returns/:id/resolve') @Permissions('returns.resolve') resolveReturn(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.resolveReturn(this.company(req),req.user?.sub||'',id,body);}
  @Get('inventory/context') @Permissions('logistics_inventory.read') inventoryContext(@Req() req:AuthRequest){return this.service.inventoryContext(this.company(req));}
  @Get('inventory/serials') @Permissions('logistics_inventory.read') serials(@Req() req:AuthRequest,@Query('q') q=''){return this.service.serialTrace(this.company(req),q);}
  @Get('inventory/trace') @Permissions('logistics_inventory.read') trace(@Req() req:AuthRequest,@Query('q') q=''){return this.service.traceInventory(this.company(req),q);}
  @Get('inventory/movements') @Permissions('logistics_inventory.read') movements(@Req() req:AuthRequest){return this.service.inventoryMovements(this.company(req));}
  @Get('inventory/counts') @Permissions('logistics_inventory.read') counts(@Req() req:AuthRequest){return this.service.listCounts(this.company(req));}
  @Get('inventory/counts/:id') @Permissions('logistics_inventory.read') count(@Req() req:AuthRequest,@Param('id') id:string){return this.service.countDetails(this.company(req),id);}
  @Post('inventory/counts') @Permissions('logistics_inventory.count') createCount(@Req() req:AuthRequest,@Body() body:any,@Headers('idempotency-key') key?:string){return this.service.createCount(this.company(req),req.user?.sub||'',body,key);}
  @Patch('inventory/counts/:id/lines') @Permissions('logistics_inventory.count') saveCount(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any,@Headers('idempotency-key') key?:string){return this.service.saveCount(this.company(req),req.user?.sub||'',id,body,key);}
  @Post('inventory/counts/:id/submit') @Permissions('logistics_inventory.count') submitCount(@Req() req:AuthRequest,@Param('id') id:string){return this.service.submitCount(this.company(req),req.user?.sub||'',id);}
  @Post('inventory/counts/:id/reconcile') @Permissions('logistics_inventory.reconcile') reconcileCount(@Req() req:AuthRequest,@Param('id') id:string,@Headers('idempotency-key') key?:string){return this.service.reconcileCount(this.company(req),req.user?.sub||'',id,key);}
}
