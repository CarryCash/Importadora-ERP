import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { LogisticsControlCenterService } from './control-center.service';

type AuthRequest=Request&{user?:{sub:string;company_id:string}};
@Controller('api/logistics/control')
export class LogisticsControlCenterController{
 constructor(private readonly service:LogisticsControlCenterService){}
 @Get('context') @Permissions('logistics_control.read') context(@Req() r:AuthRequest,@Query('from') from?:string,@Query('to') to?:string){return this.service.context(r.user!.company_id,from,to);}
 @Post('incidents') @Permissions('logistics_incidents.manage') createIncident(@Req() r:AuthRequest,@Body() d:any){return this.service.createIncident(r.user!.company_id,r.user!.sub,d);}
 @Patch('incidents/:id') @Permissions('logistics_incidents.manage') updateIncident(@Req() r:AuthRequest,@Param('id') id:string,@Body() d:any){return this.service.updateIncident(r.user!.company_id,r.user!.sub,id,d);}
 @Patch('incidents/:id/status') @Permissions('logistics_incidents.manage') transitionIncident(@Req() r:AuthRequest,@Param('id') id:string,@Body() d:any){return this.service.transitionIncident(r.user!.company_id,r.user!.sub,id,d.status,d);}
 @Post('assets') @Permissions('logistics_assets.manage') createAsset(@Req() r:AuthRequest,@Body() d:any){return this.service.createAsset(r.user!.company_id,r.user!.sub,d);}
 @Patch('assets/:id') @Permissions('logistics_assets.manage') updateAsset(@Req() r:AuthRequest,@Param('id') id:string,@Body() d:any){return this.service.updateAsset(r.user!.company_id,id,d);}
 @Post('services') @Permissions('logistics_services.manage') createService(@Req() r:AuthRequest,@Body() d:any){return this.service.createServiceJob(r.user!.company_id,r.user!.sub,d);}
 @Patch('services/:id/status') @Permissions('logistics_services.manage') transitionService(@Req() r:AuthRequest,@Param('id') id:string,@Body() d:any){return this.service.transitionServiceJob(r.user!.company_id,r.user!.sub,id,d.status,d);}
 @Post('rules') @Permissions('logistics_automation.manage') createRule(@Req() r:AuthRequest,@Body() d:any){return this.service.createRule(r.user!.company_id,r.user!.sub,d);}
 @Patch('rules/:id') @Permissions('logistics_automation.manage') setRuleActive(@Req() r:AuthRequest,@Param('id') id:string,@Body() d:any){return this.service.setRuleActive(r.user!.company_id,id,d.is_active);}
}
