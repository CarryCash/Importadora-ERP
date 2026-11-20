import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { TmsService } from './tms.service';

type AuthRequest = Request & { user?: { sub: string; company_id?: string } };

@Controller('api/tms')
export class TmsController {
  constructor(private readonly service:TmsService){}
  private company(req:AuthRequest){return req.user?.company_id||'10000000-0000-4000-8000-000000000001';}
  @Get('context') @Permissions('tms.read')
  context(@Req() req:AuthRequest){return this.service.context(this.company(req));}
  @Get('trips') @Permissions('tms.read')
  trips(@Req() req:AuthRequest){return this.service.trips(this.company(req));}
  @Get('trips/:id') @Permissions('tms.read')
  trip(@Req() req:AuthRequest,@Param('id') id:string){return this.service.trip(this.company(req),id);}
  @Post('carriers') @Permissions('tms.manage')
  carrier(@Req() req:AuthRequest,@Body() body:any){return this.service.createCarrier(this.company(req),body);}
  @Patch('carriers/:id') @Permissions('tms.manage')
  updateCarrier(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.updateResource(this.company(req),'carriers',id,body);}
  @Post('vehicles') @Permissions('tms.manage')
  vehicle(@Req() req:AuthRequest,@Body() body:any){return this.service.createVehicle(this.company(req),body);}
  @Patch('vehicles/:id') @Permissions('tms.manage')
  updateVehicle(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.updateResource(this.company(req),'vehicles',id,body);}
  @Post('drivers') @Permissions('tms.manage')
  driver(@Req() req:AuthRequest,@Body() body:any){return this.service.createDriver(this.company(req),body);}
  @Patch('drivers/:id') @Permissions('tms.manage')
  updateDriver(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.updateResource(this.company(req),'drivers',id,body);}
  @Post('tariffs') @Permissions('tms.manage')
  tariff(@Req() req:AuthRequest,@Body() body:any){return this.service.createTariff(this.company(req),body);}
  @Patch('tariffs/:id') @Permissions('tms.manage')
  updateTariff(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.updateResource(this.company(req),'tariffs',id,body);}
  @Post('trips') @Permissions('tms.manage')
  createTrip(@Req() req:AuthRequest,@Body() body:any){return this.service.createTrip(this.company(req),req.user?.sub||'',body);}
  @Post('trips/:id/depart') @Permissions('tms.dispatch')
  depart(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.depart(this.company(req),req.user?.sub||'',id,body);}
  @Post('trips/:id/resequence') @Permissions('tms.manage')
  resequence(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.resequence(this.company(req),id,body);}
  @Patch('trips/:id/stops/:stopId/window') @Permissions('tms.manage')
  window(@Req() req:AuthRequest,@Param('id') id:string,@Param('stopId') stopId:string,@Body() body:any){return this.service.updateWindow(this.company(req),id,stopId,body);}
  @Post('trips/:id/stops/:stopId/status') @Permissions('tms.delivery')
  stopStatus(@Req() req:AuthRequest,@Param('id') id:string,@Param('stopId') stopId:string,@Body() body:any){return this.service.updateStop(this.company(req),req.user?.sub||'',id,stopId,body);}
  @Post('trips/:id/expenses') @Permissions('tms.finance')
  expense(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addExpense(this.company(req),req.user?.sub||'',id,body);}
  @Post('trips/:id/close') @Permissions('tms.dispatch')
  close(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.closeTrip(this.company(req),req.user?.sub||'',id,body);}
  @Post('trips/:id/incidents') @Permissions('tms.incidents')
  incident(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addIncident(this.company(req),req.user?.sub||'',id,body);}
  @Patch('incidents/:incidentId/resolve') @Permissions('tms.incidents')
  resolveIncident(@Req() req:AuthRequest,@Param('incidentId') id:string,@Body() body:any){return this.service.resolveIncident(this.company(req),req.user?.sub||'',id,body);}
}
