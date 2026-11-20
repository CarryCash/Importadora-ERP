import { Module } from '@nestjs/common';
import { ReceivingController } from './receiving.controller';
import { ReceivingRepository } from './receiving.repository';
import { ReceivingService } from './receiving.service';

@Module({ controllers: [ReceivingController], providers: [ReceivingRepository, ReceivingService] })
export class ReceivingModule {}
