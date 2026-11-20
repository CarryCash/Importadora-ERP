import { Module } from '@nestjs/common';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { LogisticsRepository } from './logistics.repository';
import { LogisticsOperationsController } from './operations.controller';
import { LogisticsOperationsService } from './operations.service';
import { LogisticsOperationsRepository } from './operations.repository';
import { LogisticsExpeditionsController } from './expeditions.controller';
import { LogisticsExpeditionsService } from './expeditions.service';
import { LogisticsQualityCostsController } from './quality-costs.controller';
import { LogisticsQualityCostsService } from './quality-costs.service';
import { LogisticsControlCenterController } from './control-center.controller';
import { LogisticsControlCenterService } from './control-center.service';
import { LogisticsDockAppointmentsController } from './dock-appointments.controller';
import { LogisticsDockAppointmentsService } from './dock-appointments.service';

@Module({
  controllers: [LogisticsController, LogisticsOperationsController, LogisticsExpeditionsController, LogisticsQualityCostsController, LogisticsControlCenterController, LogisticsDockAppointmentsController],
  providers: [LogisticsService, LogisticsRepository, LogisticsOperationsService, LogisticsOperationsRepository, LogisticsExpeditionsService, LogisticsQualityCostsService, LogisticsControlCenterService, LogisticsDockAppointmentsService],
  exports: [LogisticsService]
})
export class LogisticsModule {}
