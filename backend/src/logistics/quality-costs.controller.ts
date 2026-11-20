import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { LogisticsQualityCostsService } from './quality-costs.service';

type AuthRequest=Request&{user?:{sub:string;company_id:string;branch_id?:string}};
@Controller('api/logistics')
export class LogisticsQualityCostsController {
 constructor(private readonly service:LogisticsQualityCostsService){}
 @Get('quality/context') @Permissions('logistics_quality.read') qualityContext(@Req() r:AuthRequest){return this.service.qualityContext(r.user!.company_id);}
 @Post('quality/plans') @Permissions('logistics_quality.manage') createPlan(@Req() r:AuthRequest,@Body() body:any){return this.service.createPlan(r.user!.company_id,r.user!.sub,body);}
 @Post('quality/inspections') @Permissions('logistics_quality.manage') createInspection(@Req() r:AuthRequest,@Body() body:any){return this.service.createInspection(r.user!.company_id,r.user!.sub,body);}
 @Patch('quality/inspections/:id/release') @Permissions('logistics_quality.release') releaseInspection(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.releaseInspection(r.user!.company_id,r.user!.sub,id,body);}
 @Post('quality/temperatures') @Permissions('logistics_quality.manage') createTemperature(@Req() r:AuthRequest,@Body() body:any){return this.service.createTemperature(r.user!.company_id,r.user!.sub,body);}
 @Post('quality/incidents') @Permissions('logistics_quality.manage') createIncident(@Req() r:AuthRequest,@Body() body:any){return this.service.createQualityIncident(r.user!.company_id,r.user!.sub,body);}
 @Patch('quality/incidents/:id/close') @Permissions('logistics_quality.manage') closeIncident(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.closeQualityIncident(r.user!.company_id,r.user!.sub,id,body);}
 @Get('costs/context') @Permissions('logistics_costs.read') costContext(@Req() r:AuthRequest){return this.service.costContext(r.user!.company_id);}
 @Post('costs/centers') @Permissions('logistics_costs.manage') createCostCenter(@Req() r:AuthRequest,@Body() body:any){return this.service.createCostCenter(r.user!.company_id,body);}
 @Post('costs/tariffs') @Permissions('logistics_costs.manage') createTariff(@Req() r:AuthRequest,@Body() body:any){return this.service.createTariff(r.user!.company_id,body);}
 @Patch('costs/tariffs/:id') @Permissions('logistics_costs.manage') updateTariff(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.updateTariff(r.user!.company_id,r.user!.sub,id,body);}
 @Post('costs') @Permissions('logistics_costs.manage') createCost(@Req() r:AuthRequest,@Body() body:any){return this.service.createCost(r.user!.company_id,r.user!.sub,body);}
 @Patch('costs/:id/approve') @Permissions('logistics_costs.approve') approveCost(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.approveCost(r.user!.company_id,r.user!.sub,id,body);}
 @Post('costs/:id/reconcile') @Permissions('logistics_costs.reconcile') reconcileCost(@Req() r:AuthRequest,@Param('id') id:string,@Headers('idempotency-key') key?:string){return this.service.reconcileCost(r.user!.company_id,r.user!.sub,id,r.user!.branch_id,key);}
 @Post('costs/:id/allocate-import') @Permissions('logistics_costs.manage') allocateImport(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.allocateImportCost(r.user!.company_id,id,body);}
}
