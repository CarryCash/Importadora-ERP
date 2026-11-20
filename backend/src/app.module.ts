import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ImportsModule } from './imports/imports.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { ReportsModule } from './reports/reports.module';
import { FinanceModule } from './finance/finance.module';
import { LogisticsModule } from './logistics/logistics.module';
import { CompanyModule } from './company/company.module';
import { PermissionsGuard } from './auth/permissions.guard';
import { AuditInterceptor } from './database/audit.interceptor';
import { ReceivingModule } from './receiving/receiving.module';
import { StorageModule } from './storage/storage.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { TransfersModule } from './transfers/transfers.module';
import { TmsModule } from './tms/tms.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    DatabaseModule, 
    ProductsModule, 
    InventoryModule, 
    SuppliersModule, 
    ImportsModule, 
    CustomersModule, 
    SalesModule,
    UsersModule,
    AuthModule,
    ReportsModule,
    FinanceModule,
    LogisticsModule,
    CompanyModule,
    ReceivingModule,
    StorageModule,
    DispatchModule,
    TransfersModule,
    TmsModule,
    SecurityModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
