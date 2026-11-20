import { Controller, Get, Post, Body, Param, Patch, Delete, Req, Query, Header } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Permissions } from '../auth/permissions.decorator';

@Controller('api/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Permissions('customers.write')
  create(@Body() dto: any,@Req() req:any) {
    return this.customersService.create(req.user.company_id,req.user.sub,dto);
  }

  @Get('analytics')
  @Permissions('customers.read')
  analytics(@Req() req:any){return this.customersService.getAnalytics(req.user.company_id);}

  @Get('export.csv')
  @Permissions('customers.export')
  @Header('Content-Type','text/csv; charset=utf-8')
  @Header('Content-Disposition','attachment; filename="clientes.csv"')
  exportCsv(@Req() req:any){return this.customersService.exportCsv(req.user.company_id);}

  @Post('import.csv')
  @Permissions('customers.write')
  importCsv(@Body() dto:any,@Req() req:any){return this.customersService.importCsv(req.user.company_id,req.user.sub,String(dto.csv||''));}

  @Get()
  @Permissions('customers.read')
  findAll(@Req() req:any,@Query() query:any) {
    return this.customersService.findAll(req.user.company_id,query);
  }

  @Get(':id')
  @Permissions('customers.read')
  findOne(@Param('id') id: string,@Req() req:any) {
    return this.customersService.findOne(req.user.company_id,id);
  }

  @Patch(':id')
  @Permissions('customers.write')
  update(@Param('id') id: string, @Body() dto: any,@Req() req:any) {
    return this.customersService.update(req.user.company_id,req.user.sub,id, dto);
  }

  @Post(':id/credit-requests')
  @Permissions('customers.credit.manage')
  requestCredit(@Param('id') id:string,@Body() dto:any,@Req() req:any){return this.customersService.requestCredit(req.user.company_id,req.user.sub,id,dto);}

  @Patch(':id/credit-requests/:requestId/review')
  @Permissions('customers.credit.approve')
  reviewCreditRequest(@Param('id') id:string,@Param('requestId') requestId:string,@Body() dto:any,@Req() req:any){return this.customersService.reviewCreditRequest(req.user.company_id,req.user.sub,id,requestId,dto);}

  @Post(':id/contacts')
  @Permissions('customers.write')
  createContact(@Param('id') id:string,@Body() dto:any,@Req() req:any){return this.customersService.createContact(req.user.company_id,req.user.sub,id,dto);}

  @Patch(':id/contacts/:contactId') @Permissions('customers.write')
  updateContact(@Param('id') id:string,@Param('contactId') contactId:string,@Body() dto:any,@Req() req:any){return this.customersService.updateContact(req.user.company_id,req.user.sub,id,contactId,dto);}
  @Delete(':id/contacts/:contactId') @Permissions('customers.write')
  deactivateContact(@Param('id') id:string,@Param('contactId') contactId:string,@Req() req:any){return this.customersService.deactivateRelationship(req.user.company_id,req.user.sub,id,'contact',contactId);}

  @Post(':id/addresses')
  @Permissions('customers.write')
  createAddress(@Param('id') id:string,@Body() dto:any,@Req() req:any){return this.customersService.createAddress(req.user.company_id,req.user.sub,id,dto);}
  @Patch(':id/addresses/:addressId') @Permissions('customers.write')
  updateAddress(@Param('id') id:string,@Param('addressId') addressId:string,@Body() dto:any,@Req() req:any){return this.customersService.updateAddress(req.user.company_id,req.user.sub,id,addressId,dto);}
  @Delete(':id/addresses/:addressId') @Permissions('customers.write')
  deactivateAddress(@Param('id') id:string,@Param('addressId') addressId:string,@Req() req:any){return this.customersService.deactivateRelationship(req.user.company_id,req.user.sub,id,'address',addressId);}

  @Delete(':id')
  @Permissions('customers.write')
  remove(@Param('id') id: string,@Req() req:any) {
    return this.customersService.remove(req.user.company_id,req.user.sub,id);
  }

  @Get(':id/statement')
  @Permissions('customers.read')
  getStatement(@Param('id') id: string,@Req() req:any) {
    return this.customersService.getStatement(req.user.company_id,id);
  }
}
