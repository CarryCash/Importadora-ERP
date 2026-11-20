import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { StockMovementsRepository } from './stock-movements.repository';
import { WarehousesRepository } from './warehouses.repository';
import { FifoService } from './fifo.service';
import { MovementService } from './movement.service';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryRepository,
    StockMovementsRepository,
    WarehousesRepository,
    FifoService,
    MovementService,
  ],
  exports: [
    InventoryService,
    InventoryRepository,
    StockMovementsRepository,
    WarehousesRepository,
    FifoService,
    MovementService,
  ],
})
export class InventoryModule {}
