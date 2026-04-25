import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/finance')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  async getSummary() {
    return this.financeService.getFinancialSummary();
  }

  @Get('expenses')
  async getExpenses() {
    return this.financeService.getExpenses();
  }

  @Post('expenses')
  async createExpense(@Body() data: any, @Req() req: any) {
    return this.financeService.createExpense({
      ...data,
      user_id: req.user.userId
    });
  }
}
