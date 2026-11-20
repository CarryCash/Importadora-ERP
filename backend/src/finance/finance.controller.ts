import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';

@Controller('api/finance')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin','erp_admin','gerente_financiero','contador')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  private branchScope(user:any){return user.roles?.some((role:string)=>['admin','erp_admin','gerente_financiero','contador'].includes(role))?null:user.branch_id||null;}

  @Get('summary')
  @Permissions('finance.read')
  async getSummary(@Req() req: any) {
    return this.financeService.getFinancialSummary(req.user.company_id,this.branchScope(req.user));
  }

  @Get('expenses')
  @Permissions('finance.read')
  async getExpenses(@Req() req: any) {
    return this.financeService.getExpenses(req.user.company_id,this.branchScope(req.user));
  }

  @Post('expenses')
  @Permissions('finance.write')
  async createExpense(@Body() data: any, @Req() req: any) {
    return this.financeService.createExpense({
      ...data,
      user_id: req.user.sub,
      company_id: req.user.company_id,
      branch_id: req.user.branch_id
    });
  }

  @Get('cost-centers')
  @Permissions('finance.read')
  async getCostCenters(@Req() req: any) {
    return this.financeService.listCostCenters(req.user.company_id);
  }

  @Post('cost-centers')
  @Permissions('finance.write')
  async createCostCenter(@Body() data: any, @Req() req: any) {
    return this.financeService.createCostCenter(req.user.company_id, data);
  }

  @Get('supplier-payments')
  @Permissions('finance.read')
  async getSupplierPayments(@Req() req: any) {
    return this.financeService.listSupplierPayments(req.user.company_id);
  }

  @Post('supplier-payments')
  @Permissions('finance.write')
  async createSupplierPayment(@Body() data: any, @Req() req: any) {
    return this.financeService.recordSupplierPayment(req.user.company_id, req.user.sub, data);
  }
}
