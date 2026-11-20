import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { LogisticsDockAppointmentsService } from './dock-appointments.service';
type AuthRequest=Request&{user?:{sub:string;company_id:string}};
@Controller('api/logistics/docks')
export class LogisticsDockAppointmentsController{
 constructor(private readonly service:LogisticsDockAppointmentsService){}
 @Get('context') @Permissions('logistics_control.read') context(@Req() r:AuthRequest,@Query('from') from?:string,@Query('to') to?:string){return this.service.context(r.user!.company_id,from,to);}
 @Post() @Permissions('logistics_docks.manage') createDock(@Req() r:AuthRequest,@Body() d:any){return this.service.createDock(r.user!.company_id,d);}
 @Post('appointments') @Permissions('logistics_docks.manage') createAppointment(@Req() r:AuthRequest,@Body() d:any){return this.service.createAppointment(r.user!.company_id,r.user!.sub,d);}
 @Patch('appointments/:id/status') @Permissions('logistics_docks.manage') transition(@Req() r:AuthRequest,@Param('id') id:string,@Body() d:any){return this.service.transition(r.user!.company_id,r.user!.sub,id,d.status,d);}
}
