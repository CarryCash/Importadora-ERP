import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { ProductPhase2Service } from './product-phase2.service';

type ProductPhase2Request=Request&{user?:{sub:string;company_id:string;roles?:string[]}};

@Controller('api/products')
export class ProductPhase2Controller{
  constructor(private readonly phase2:ProductPhase2Service){}
  @Get(':id/variants') @Permissions('products.read')
  variants(@Param('id') id:string,@Req() req:ProductPhase2Request){return this.phase2.variants(req.user!.company_id,id);}
  @Post(':id/variants') @Permissions('products.write')
  createVariant(@Param('id') id:string,@Body() body:any,@Req() req:ProductPhase2Request){return this.phase2.createVariant(req.user!.company_id,req.user!.sub,id,body);}
  @Patch(':id/variants/:variantId') @Permissions('products.write')
  updateVariant(@Param('id') id:string,@Param('variantId') variantId:string,@Body() body:any,@Req() req:ProductPhase2Request){return this.phase2.updateVariant(req.user!.company_id,req.user!.sub,id,variantId,body);}

  @Get(':id/units') @Permissions('products.read')
  units(@Param('id') id:string,@Req() req:ProductPhase2Request){return this.phase2.units(req.user!.company_id,id);}
  @Post(':id/units') @Permissions('products.write')
  createUnit(@Param('id') id:string,@Body() body:any,@Req() req:ProductPhase2Request){return this.phase2.createUnit(req.user!.company_id,req.user!.sub,id,body);}
  @Post(':id/unit-conversions') @Permissions('products.write')
  createConversion(@Param('id') id:string,@Body() body:any,@Req() req:ProductPhase2Request){return this.phase2.createConversion(req.user!.company_id,req.user!.sub,id,body);}
  @Post(':id/units/convert') @Permissions('products.read')
  convert(@Param('id') id:string,@Body() body:any,@Req() req:ProductPhase2Request){return this.phase2.convert(req.user!.company_id,id,body);}
  @Post(':id/unit-conversions/:conversionId/approval') @Permissions('products.write')
  approveConversion(@Param('id') id:string,@Param('conversionId') conversionId:string,@Req() req:ProductPhase2Request){if(!req.user!.roles?.some(role=>['admin','erp_admin','inventory_manager'].includes(role)))throw new ForbiddenException('Solo Inventario o un administrador puede aprobar cambios de conversión.');return this.phase2.approveConversion(req.user!.company_id,req.user!.sub,id,conversionId);}

  @Get(':id/logistics') @Permissions('products.read')
  logistics(@Param('id') id:string,@Req() req:ProductPhase2Request){return this.phase2.logistics(req.user!.company_id,id);}
  @Get(':id/logistics/history') @Permissions('products.read')
  logisticsHistory(@Param('id') id:string,@Req() req:ProductPhase2Request){return this.phase2.logisticsHistory(req.user!.company_id,id);}
  @Post(':id/logistics') @Permissions('products.write')
  saveLogistics(@Param('id') id:string,@Body() body:any,@Req() req:ProductPhase2Request){return this.phase2.saveLogistics(req.user!.company_id,req.user!.sub,id,body);}
}
