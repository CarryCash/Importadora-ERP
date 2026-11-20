import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { ProductCatalogRepository } from './product-catalog.repository';
import { ProductsService } from './products.service';

type CatalogRequest = Request & { user?: { company_id: string } };

@Controller('api/product-catalog')
export class ProductCatalogController {
  constructor(private readonly repository: ProductCatalogRepository,private readonly productsService:ProductsService) {}

  @Get(':type')
  @Permissions('products.read')
  list(@Param('type') type: string, @Req() req: CatalogRequest) { return this.repository.list(req.user!.company_id, type); }

  @Post(':type')
  @Permissions('products.write')
  create(@Param('type') type: string, @Body() body: Record<string, unknown>, @Req() req: CatalogRequest) { return this.repository.create(req.user!.company_id, type, body); }

  @Patch(':type/:id')
  @Permissions('products.write')
  update(@Param('type') type: string, @Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: CatalogRequest) { return this.repository.update(req.user!.company_id, type, id, body); }

  @Get('categories/:categoryId/attributes')
  @Permissions('products.read')
  categoryAttributes(@Param('categoryId') id:string,@Req() req:CatalogRequest){return this.productsService.categoryAttributes(req.user!.company_id,id);}

  @Post('categories/:categoryId/attributes')
  @Permissions('products.write')
  createCategoryAttribute(@Param('categoryId') id:string,@Body() body:any,@Req() req:CatalogRequest){return this.productsService.createCategoryAttribute(req.user!.company_id,id,body);}

  @Patch('categories/:categoryId/attributes/:definitionId')
  @Permissions('products.write')
  updateCategoryAttribute(@Param('categoryId') id:string,@Param('definitionId') definitionId:string,@Body() body:any,@Req() req:CatalogRequest){return this.productsService.updateCategoryAttribute(req.user!.company_id,id,definitionId,body);}
}
