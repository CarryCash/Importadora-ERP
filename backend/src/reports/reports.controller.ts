import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Permissions } from '../auth/permissions.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Controller('api/reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Permissions('dashboard.read')
  async getDashboard() {
    return this.reportsService.getDashboardData();
  }

  @Get('customers')
  @Permissions('customers.read')
  async getCustomerAnalytics(@Req() req: any) {
    return this.reportsService.getCustomerAnalytics(req.user.company_id);
  }

  // 1. Reporte de Compras e Importaciones
  @Get('purchases-imports')
  @Permissions('dashboard.read')
  async getImportsPurchasesReport(@Req() req: any) {
    return this.reportsService.getImportsPurchasesReport(req.user.company_id);
  }

  // 2. Reporte de Inventario y Valoración FIFO
  @Get('inventory-fifo')
  @Permissions('inventory.read')
  async getInventoryFifoValuationReport(@Req() req: any) {
    return this.reportsService.getInventoryFifoValuationReport(req.user.company_id);
  }

  // 3. Reporte de Ventas y Margen Bruto
  @Get('sales-margin')
  @Permissions('dashboard.read')
  async getSalesGrossMarginReport(@Req() req: any) {
    return this.reportsService.getSalesGrossMarginReport(req.user.company_id);
  }

  // 4. Reporte de Antigüedad de Cartera y Cuentas por Pagar
  @Get('aging-balance')
  @Permissions('finance.read')
  async getReceivablesPayablesAgingReport(@Req() req: any) {
    return this.reportsService.getReceivablesPayablesAgingReport(req.user.company_id);
  }

  // 5. Reporte por Centros de Costo
  @Get('cost-centers')
  @Permissions('finance.read')
  async getCostCentersOperationalReport(@Req() req: any) {
    return this.reportsService.getCostCentersOperationalReport(req.user.company_id);
  }
}
