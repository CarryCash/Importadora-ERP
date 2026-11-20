import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { Request } from 'express';
import type { Response } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { ProductMediaService } from './product-media.service';

type MediaRequest=Request&{user?:{sub:string;company_id:string}};
const fileInterceptor=FileInterceptor('file',{limits:{fileSize:25*1024*1024},fileFilter:(_req,file,callback)=>{const allowed=/^(image\/(jpeg|png|webp|gif|avif)|application\/(pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/plain)$/i.test(file.mimetype);callback(allowed?null:new BadRequestException('Formato no admitido. Usa imágenes, PDF, DOCX, XLSX o TXT.'),allowed);}});

@Controller('api/products/:id/media')
export class ProductMediaController {
  constructor(private readonly media:ProductMediaService){}
  @Get() @Permissions('products.read') list(@Param('id') id:string,@Req() req:MediaRequest){return this.media.list(req.user!.company_id,id);}
  @Post() @Permissions('products.write') @UseInterceptors(fileInterceptor) upload(@Param('id') id:string,@UploadedFile() file:any,@Body() body:any,@Req() req:MediaRequest){return this.media.upload(req.user!.company_id,req.user!.sub,id,file,body);}
  @Post(':mediaId/versions') @Permissions('products.write') @UseInterceptors(fileInterceptor) replace(@Param('id') id:string,@Param('mediaId') mediaId:string,@UploadedFile() file:any,@Body() body:any,@Req() req:MediaRequest){return this.media.upload(req.user!.company_id,req.user!.sub,id,file,{...body,media_id:mediaId});}
  @Patch(':mediaId') @Permissions('products.write') update(@Param('id') id:string,@Param('mediaId') mediaId:string,@Body() body:any,@Req() req:MediaRequest){return this.media.updateMetadata(req.user!.company_id,req.user!.sub,id,mediaId,body);}
  @Post(':mediaId/archive') @Permissions('products.write') archive(@Param('id') id:string,@Param('mediaId') mediaId:string,@Body('reason') reason:string,@Req() req:MediaRequest){return this.media.archive(req.user!.company_id,req.user!.sub,id,mediaId,reason);}
  @Get(':mediaId/versions/:versionId/download') @Permissions('products.read') async download(@Param('id') id:string,@Param('mediaId') mediaId:string,@Param('versionId') versionId:string,@Req() req:MediaRequest,@Res() res:Response){const file=await this.media.download(req.user!.company_id,id,mediaId,versionId);res.setHeader('Content-Type',file.mime_type);res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`);res.setHeader('X-Content-Type-Options','nosniff');createReadStream(file.path).on('error',()=>{if(!res.headersSent)res.status(404).end();}).pipe(res);}
}
