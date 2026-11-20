import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductCatalogController } from './product-catalog.controller';
import { ProductCatalogRepository } from './product-catalog.repository';
import { PricingController } from './pricing.controller';
import { PricingRepository } from './pricing.repository';
import { ProductPhase2Controller } from './product-phase2.controller';
import { ProductPhase2Service } from './product-phase2.service';
import { ProductPhase4Controller } from './product-phase4.controller';
import { ProductPhase4Service } from './product-phase4.service';
import { ProductMediaController } from './product-media.controller';
import { ProductMediaService } from './product-media.service';
import { ProductAdvancedController } from './product-advanced.controller';
import { ProductAdvancedService } from './product-advanced.service';

@Module({
  controllers: [ProductsController, ProductCatalogController, PricingController, ProductPhase2Controller, ProductPhase4Controller, ProductMediaController, ProductAdvancedController],
  providers: [ProductsService, ProductsRepository, ProductCatalogRepository, PricingRepository, ProductPhase2Service, ProductPhase4Service, ProductMediaService, ProductAdvancedService],
  exports: [ProductsService],
})
export class ProductsModule {}
