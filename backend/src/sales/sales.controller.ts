import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';

@Controller('api/sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  private branchScope(user:any){return user.roles?.some((role:string)=>['admin','erp_admin'].includes(role))?null:user.branch_id||null;}

  // POST /api/sales — Crear venta
  @Post()
  @Permissions('sales.create')
  create(@Body() dto: any, @Req() req: any) {
    return this.salesService.create({ ...dto, user_id: req.user.sub, cashier_id: req.user.sub, company_id:req.user.company_id, branch_id:req.user.branch_id, user_roles:req.user.roles||[] });
  }

  // GET /api/sales — Listar ventas
  @Get()
  @Permissions('sales.read')
  findAll(@Req() req:any) {
    return this.salesService.findAll(req.user.company_id,this.branchScope(req.user));
  }

  // GET /api/sales/summary — KPIs
  @Get('summary')
  @Permissions('sales.read')
  getSummary(@Req() req:any) {
    return this.salesService.getSummary(req.user.company_id,this.branchScope(req.user));
  }

  // GET /api/sales/:id — Detalle de venta
  @Get(':id')
  @Permissions('sales.read')
  findOne(@Param('id') id: string,@Req() req:any) {
    return this.salesService.findOne(req.user.company_id,id,this.branchScope(req.user));
  }

  // POST /api/sales/:id/payments — Agregar pago
  @Post(':id/payments')
  @Permissions('sales.payments')
  addPayment(@Param('id') id: string, @Body() dto: any,@Req() req:any) {
    return this.salesService.addPayment(req.user.company_id,id, dto,this.branchScope(req.user));
  }

  // PATCH /api/sales/:id/cancel — Cancelar venta
  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('admin', 'erp_admin', 'sales', 'jefe_ventas')
  @Permissions('sales.cancel')
  cancel(@Param('id') id: string,@Req() req:any) {
    return this.salesService.cancel(req.user.company_id,id,this.branchScope(req.user));
  }
}
