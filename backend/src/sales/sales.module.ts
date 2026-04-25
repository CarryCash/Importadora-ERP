import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesRepository } from './sales.repository';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { ReturnsRepository } from './returns.repository';
import { InvoicesRepository } from './invoices.repository';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuotesRepository } from './quotes.repository';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [SalesController, ReturnsController, QuotesController],
  providers: [
    SalesService, SalesRepository, 
    ReturnsService, ReturnsRepository, 
    InvoicesRepository, 
    QuotesService, QuotesRepository
  ],
  exports: [SalesService, ReturnsService, QuotesService],
})
export class SalesModule {}
