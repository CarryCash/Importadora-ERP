import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Permissions } from '../auth/permissions.decorator';
import { PricingRepository } from './pricing.repository';

@Controller('api/product-pricing')
export class PricingController {
  constructor(private readonly repository: PricingRepository) {}
  @Get('lists') @Permissions('products.read') lists(@Req() req:any){return this.repository.lists(req.user.company_id);}
  @Get('branches') @Permissions('products.read') branches(@Req() req:any){return this.repository.branches(req.user.company_id);}
  @Get('available') @Permissions('products.read') available(@Req() req:any,@Query('customer_id') customerId?:string){return this.repository.available(req.user.company_id,customerId,req.user.branch_id);}
  @Post('lists') @Permissions('products.write') create(@Body() body:any,@Req() req:any){return this.repository.create(req.user.company_id,req.user.sub,body);}
  @Patch('lists/:id') @Permissions('products.write') update(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.repository.update(req.user.company_id,req.user.sub,id,body);}
  @Get('lists/:id/rules') @Permissions('products.read') rules(@Param('id') id:string,@Req() req:any){return this.repository.rules(req.user.company_id,id);}
  @Post('lists/:id/rules') @Permissions('products.write') saveRule(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.repository.saveRule(req.user.company_id,req.user.sub,id,body);}
  @Get('lists/:id/history') @Permissions('products.read') history(@Param('id') id:string,@Req() req:any){return this.repository.history(req.user.company_id,id);}
  @Get('lists/:id/events') @Permissions('products.read') events(@Param('id') id:string,@Req() req:any){return this.repository.events(req.user.company_id,id);}
  @Patch('lists/:id/approval') @Permissions('products.write') approve(@Param('id') id:string,@Body() body:any,@Req() req:any){
    if(!req.user.roles?.some((role:string)=>['admin','erp_admin'].includes(role)))throw new ForbiddenException('Solo un administrador puede aprobar cambios de precios.');
    return this.repository.approval(req.user.company_id,req.user.sub,id,body?.decision,body?.reason);
  }
  @Patch('lists/:id/status') @Permissions('products.write') status(@Param('id') id:string,@Body('is_active') isActive:boolean,@Req() req:any){return this.repository.setActive(req.user.company_id,req.user.sub,id,isActive);}
}
