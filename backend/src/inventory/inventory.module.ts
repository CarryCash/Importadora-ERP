import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { StockMovementsRepository } from './stock-movements.repository';
import { WarehousesRepository } from './warehouses.repository';
import { Module } from '@nestjs/common';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository, StockMovementsRepository, WarehousesRepository],
  exports: [InventoryService, InventoryRepository, StockMovementsRepository, WarehousesRepository],
})
export class InventoryModule {}
