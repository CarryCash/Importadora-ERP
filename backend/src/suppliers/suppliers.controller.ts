import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { SuppliersService } from './suppliers.service';
import { Permissions } from '../auth/permissions.decorator';

@Controller('api/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get('dashboard')
  @Permissions('suppliers.read')
  dashboard(@Req() req: any) {
    return this.suppliersService.dashboard(req.user.company_id);
  }

  @Get('categories')
  @Permissions('suppliers.read')
  categories(@Req() req: any, @Query('type') type?: 'national' | 'international') {
    return this.suppliersService.categories(req.user.company_id, type);
  }

  @Post('categories')
  @Permissions('suppliers.configure')
  createCategory(@Req() req: any, @Body() dto: any) {
    return this.suppliersService.createCategory(req.user.company_id, req.user.sub, dto);
  }

  @Get('approvals')
  @Permissions('suppliers.read')
  approvals(@Req() req: any, @Query('status') status?: string) {
    return this.suppliersService.approvals(req.user.company_id, status);
  }

  @Get('evaluations')
  @Permissions('suppliers.read')
  evaluations(@Req() req:any,@Query('supplier_id') supplierId?:string){return this.suppliersService.evaluations(req.user.company_id,supplierId);}

  @Get('evaluations/policies')
  @Permissions('suppliers.read')
  evaluationPolicies(@Req() req:any){return this.suppliersService.evaluationPolicies(req.user.company_id);}

  @Post('evaluations/policies')
  @Permissions('suppliers.configure')
  saveEvaluationPolicy(@Req() req:any,@Body() dto:any){return this.suppliersService.saveEvaluationPolicy(req.user.company_id,req.user.sub,dto);}

  @Post('evaluations')
  @Permissions('suppliers.evaluate')
  createEvaluation(@Req() req:any,@Body() dto:any){return this.suppliersService.createEvaluation(req.user.company_id,req.user.sub,dto);}

  @Get('approvals/policies')
  @Permissions('suppliers.read')
  approvalPolicies(@Req() req: any, @Query('type') type?: 'national'|'international') {
    return this.suppliersService.approvalPolicies(req.user.company_id,type);
  }

  @Post('approvals/policies')
  @Permissions('suppliers.configure')
  saveApprovalPolicy(@Req() req: any, @Body() dto: any) {
    return this.suppliersService.saveApprovalPolicy(req.user.company_id,req.user.sub,dto);
  }

  @Post('approvals/:id/review')
  @Permissions('suppliers.approve')
  reviewApproval(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.suppliersService.reviewApproval(req.user.company_id, req.user.sub, id, dto.decision, dto.reason, req.user.roles || [req.user.role], dto.reviewed_documents || []);
  }

  @Post('approvals/:id/activate')
  @Permissions('suppliers.approve')
  activateSupplier(@Req() req: any,@Param('id') id:string) {
    return this.suppliersService.activateSupplier(req.user.company_id,req.user.sub,id);
  }

  @Post(':id/unlock-request')
  @Permissions('suppliers.write')
  requestUnlock(@Req() req:any,@Param('id') id:string){return this.suppliersService.requestUnlock(req.user.company_id,req.user.sub,id);}

  @Get(':id/risks')
  @Permissions('suppliers.read')
  riskOverview(@Req() req:any,@Param('id') id:string){return this.suppliersService.riskOverview(req.user.company_id,id);}

  @Get(':id/bank-accounts')
  @Permissions('suppliers.bank.read')
  bankAccounts(@Req() req:any,@Param('id') id:string,@Res({passthrough:true}) res:any){res.setHeader('Cache-Control','private, no-store');res.setHeader('Pragma','no-cache');return this.suppliersService.bankAccounts(req.user.company_id,req.user.sub,id);}

  @Post(':id/documents')
  @Permissions('suppliers.documents')
  @UseInterceptors(FileInterceptor('file',{limits:{fileSize:20*1024*1024,files:1},fileFilter:(_req,file,cb)=>{const allowed=['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'];cb(allowed.includes(file.mimetype)?null:new BadRequestException('Tipo de archivo no admitido.'),allowed.includes(file.mimetype));}}))
  uploadDocument(@Req() req:any,@Param('id') id:string,@UploadedFile() file:any,@Body() dto:any){return this.suppliersService.saveDocument(req.user.company_id,req.user.sub,id,file,dto);}

  @Get(':id/documents/:documentId/download')
  @Permissions('suppliers.documents')
  async downloadDocument(@Req() req:any,@Param('id') id:string,@Param('documentId') documentId:string,@Res() res:any){const file=await this.suppliersService.documentDownload(req.user.company_id,req.user.sub,id,documentId);res.setHeader('Content-Type',file.mime_type);res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');createReadStream(file.path).pipe(res);}

  @Post()
  @Permissions('suppliers.write')
  create(@Req() req: any, @Body() dto: any) {
    return this.suppliersService.create(req.user.company_id, req.user.sub, dto);
  }

  @Put(':id')
  @Permissions('suppliers.write')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.suppliersService.update(req.user.company_id, req.user.sub, id, dto);
  }

  @Get()
  @Permissions('suppliers.read')
  findAll(@Req() req: any, @Query('type') type?: 'national' | 'international', @Query('q') query?: string, @Query('status') status?: string) {
    return this.suppliersService.findAll(req.user.company_id, { type, query, status });
  }

  @Get(':id/360')
  @Permissions('suppliers.read')
  profile360(@Req() req: any, @Param('id') id: string) {
    return this.suppliersService.profile360(req.user.company_id, id);
  }

  @Get(':id')
  @Permissions('suppliers.read')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.suppliersService.findOne(req.user.company_id, id);
  }
}
