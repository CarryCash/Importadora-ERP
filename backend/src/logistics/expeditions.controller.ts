import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { LogisticsExpeditionsService } from './expeditions.service';

type AuthRequest=Request&{user?:{sub:string;company_id:string}};
@Controller('api/logistics')
export class LogisticsExpeditionsController {
  constructor(private readonly service:LogisticsExpeditionsService){}
  @Get('import-expeditions') @Permissions('imports.logistics.read') listImports(@Req() r:AuthRequest){return this.service.listImports(r.user!.company_id);}
  @Get('import-expeditions/sources') @Permissions('imports.logistics.read') importSources(@Req() r:AuthRequest){return this.service.listImportSources(r.user!.company_id);}
  @Post('import-expeditions/:importId') @Permissions('imports.logistics.manage') upsertImport(@Req() r:AuthRequest,@Param('importId') id:string,@Body() body:any){return this.service.upsertImport(r.user!.company_id,r.user!.sub,id,body);}
  @Patch('import-expeditions/:id') @Permissions('imports.logistics.manage') updateImport(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.updateImport(r.user!.company_id,r.user!.sub,id,body);}
  @Get('export-shipments') @Permissions('exports.logistics.read') listExports(@Req() r:AuthRequest){return this.service.listExports(r.user!.company_id);}
  @Post('export-shipments') @Permissions('exports.logistics.manage') createExport(@Req() r:AuthRequest,@Body() body:any){return this.service.createExport(r.user!.company_id,r.user!.sub,body);}
  @Patch('export-shipments/:id') @Permissions('exports.logistics.manage') updateExport(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.updateExport(r.user!.company_id,r.user!.sub,id,body);}
  @Post('import-expeditions/:id/events') @Permissions('imports.logistics.manage') importEvent(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addEvent(r.user!.company_id,r.user!.sub,'import',id,body);}
  @Post('import-expeditions/:id/costs') @Permissions('imports.logistics.manage') importCost(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addCost(r.user!.company_id,r.user!.sub,'import',id,body);}
  @Post('import-expeditions/:id/documents') @Permissions('imports.logistics.manage') importDocument(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addDocument(r.user!.company_id,r.user!.sub,'import',id,body);}
  @Post('import-expeditions/:id/packages') @Permissions('imports.logistics.manage') importPackage(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addPackage(r.user!.company_id,'import',id,body);}
  @Post('export-shipments/:id/events') @Permissions('exports.logistics.manage') exportEvent(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addEvent(r.user!.company_id,r.user!.sub,'export',id,body);}
  @Post('export-shipments/:id/costs') @Permissions('exports.logistics.manage') exportCost(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addCost(r.user!.company_id,r.user!.sub,'export',id,body);}
  @Post('export-shipments/:id/documents') @Permissions('exports.logistics.manage') exportDocument(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addDocument(r.user!.company_id,r.user!.sub,'export',id,body);}
  @Post('export-shipments/:id/packages') @Permissions('exports.logistics.manage') exportPackage(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:any){return this.service.addPackage(r.user!.company_id,'export',id,body);}
}
