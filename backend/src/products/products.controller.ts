import { Controller, Get, Post, Body, Param, Patch, UploadedFile, UseInterceptors, BadRequestException, Req, Query } from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ProductsService } from './products.service';
import { Permissions } from '../auth/permissions.decorator';

type ProductRequest=Request&{user?:{sub:string;company_id:string}};

@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('upload')
  @Permissions('products.write')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      const allowed = /^(image\/(jpeg|png|webp|gif|avif)|application\/(pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/plain)$/i.test(file.mimetype);
      callback(allowed ? null : new BadRequestException('Formato no admitido. Usa imágenes, PDF, DOCX, XLSX o TXT.'), allowed);
    },
  }))
  async upload(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Selecciona un archivo válido.');
    const directory = join(process.cwd(), 'uploads', 'products');
    mkdirSync(directory, { recursive: true });
    const extension: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'application/pdf': '.pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx', 'text/plain': '.txt' };
    const filename = `${randomUUID()}${extension[file.mimetype] || '.bin'}`;
    writeFileSync(join(directory, filename), file.buffer);
    return { url: `/uploads/products/${filename}`, name: file.originalname, mime_type: file.mimetype, size: file.size };
  }

  @Post()
  @Permissions('products.write')
  create(@Body() createProductDto: any,@Req() req:ProductRequest) {
    return this.productsService.create(req.user!.company_id,req.user!.sub,createProductDto);
  }

  @Post('bulk-import')
  @Permissions('products.write')
  bulkImport(@Body('rows') rows:any,@Req() req:ProductRequest){return this.productsService.bulkImport(req.user!.company_id,req.user!.sub,rows);}

  @Get()
  @Permissions('products.read')
  findAll(@Req() req:ProductRequest,@Query('search') search?:string,@Query('include_archived') includeArchived?:string) {
    return this.productsService.findAll(req.user!.company_id,{search,includeArchived:includeArchived==='true'});
  }

  @Patch(':id')
  @Permissions('products.write')
  update(@Param('id') id:string,@Body() body:any,@Req() req:ProductRequest){return this.productsService.update(req.user!.company_id,req.user!.sub,id,body);}

  @Get(':id')
  @Permissions('products.read')
  findOne(@Param('id') id: string,@Req() req:ProductRequest) {
    return this.productsService.findOne(req.user!.company_id,id);
  }

  @Get(':id/identifiers') @Permissions('products.read')
  identifiers(@Param('id') id:string,@Req() req:ProductRequest){return this.productsService.identifiers(req.user!.company_id,id);}

  @Get(':id/attributes') @Permissions('products.read')
  attributeValues(@Param('id') id:string,@Req() req:ProductRequest){return this.productsService.attributeValues(req.user!.company_id,id);}

  @Get(':id/history') @Permissions('products.read')
  history(@Param('id') id:string,@Req() req:ProductRequest){return this.productsService.history(req.user!.company_id,id);}

  @Post(':id/archive') @Permissions('products.write')
  archive(@Param('id') id:string,@Body('reason') reason:string,@Req() req:ProductRequest){return this.productsService.archive(req.user!.company_id,req.user!.sub,id,reason);}

  @Post(':id/restore') @Permissions('products.write')
  restore(@Param('id') id:string,@Body('reason') reason:string,@Req() req:ProductRequest){return this.productsService.restore(req.user!.company_id,req.user!.sub,id,reason);}

  @Patch(':id/tax-rate')
  @Permissions('products.write')
  updateTaxRate(@Param('id') id: string, @Body('iva_rate') ivaRate: number,@Req() req:ProductRequest) {
    return this.productsService.updateTaxRate(req.user!.company_id,req.user!.sub,id, ivaRate);
  }

  @Patch(':id/status')
  @Permissions('products.write')
  updateStatus(@Param('id') id: string, @Body() body: any,@Req() req:ProductRequest) {
    return this.productsService.updateStatus(req.user!.company_id,req.user!.sub,id, body.is_active,body.reason);
  }
}
