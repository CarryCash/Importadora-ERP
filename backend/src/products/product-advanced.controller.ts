import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { ProductAdvancedService } from './product-advanced.service';

type AdvancedRequest = Request & { user?: { sub: string; company_id: string } };

@Controller('api/products')
export class ProductAdvancedController {
  constructor(private readonly advanced: ProductAdvancedService) {}

  @Get(':id/relations') @Permissions('products.read')
  relations(@Param('id') id: string, @Req() req: AdvancedRequest) { return this.advanced.relations(req.user!.company_id, id); }

  @Post(':id/relations') @Permissions('products.write')
  addRelation(@Param('id') id: string, @Body() body: any, @Req() req: AdvancedRequest) { return this.advanced.addRelation(req.user!.company_id, req.user!.sub, id, body); }

  @Delete(':id/relations/:relationId') @Permissions('products.write')
  removeRelation(@Param('id') id: string, @Param('relationId') relationId: string, @Req() req: AdvancedRequest) { return this.advanced.removeRelation(req.user!.company_id, req.user!.sub, id, relationId); }

  @Get(':id/tags') @Permissions('products.read')
  tags(@Param('id') id: string, @Req() req: AdvancedRequest) { return this.advanced.tags(req.user!.company_id, id); }

  @Put(':id/tags') @Permissions('products.write')
  setTags(@Param('id') id: string, @Body('tags') tags: unknown, @Req() req: AdvancedRequest) { return this.advanced.setTags(req.user!.company_id, req.user!.sub, id, tags); }

  @Post(':id/generate-sku') @Permissions('products.write')
  generateSku(@Param('id') id: string, @Req() req: AdvancedRequest) { return this.advanced.generateSku(req.user!.company_id, req.user!.sub, id); }

  @Post(':id/generate-internal-code') @Permissions('products.write')
  generateInternalCode(@Param('id') id: string, @Req() req: AdvancedRequest) { return this.advanced.generateInternalCode(req.user!.company_id, req.user!.sub, id); }
}
