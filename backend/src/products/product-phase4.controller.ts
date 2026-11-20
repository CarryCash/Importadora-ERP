import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { Permissions } from '../auth/permissions.decorator';
import { ProductPhase4Service } from './product-phase4.service';

@Controller('api/products/:id')
export class ProductPhase4Controller {
  constructor(private readonly phase4:ProductPhase4Service){}
  @Get('supplier-options') @Permissions('products.read') supplierOptions(@Param('id') id:string,@Req() req:any){return this.phase4.supplierOptions(req.user.company_id,id);}
  @Get('suppliers') @Permissions('products.read') suppliers(@Param('id') id:string,@Req() req:any){return this.phase4.suppliers(req.user.company_id,id);}
  @Post('suppliers') @Permissions('products.write') createSupplier(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.phase4.createSupplier(req.user.company_id,req.user.sub,id,body);}
  @Get('import-classifications') @Permissions('products.read') classifications(@Param('id') id:string,@Req() req:any){return this.phase4.classifications(req.user.company_id,id);}
  @Post('import-classifications') @Permissions('products.write') submitClassification(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.phase4.submitClassification(req.user.company_id,req.user.sub,id,body);}
  @Post('import-classifications/:classificationId/review') @Permissions('imports.write') reviewClassification(@Param('id') id:string,@Param('classificationId') classificationId:string,@Body() body:any,@Req() req:any){if(!req.user.roles?.some((role:string)=>['admin','erp_admin','imports_manager','jefe_importaciones'].includes(role)))throw new ForbiddenException('Solo Importaciones o un administrador puede revisar partidas arancelarias.');return this.phase4.reviewClassification(req.user.company_id,req.user.sub,id,classificationId,body.decision,body.reason);}
}
