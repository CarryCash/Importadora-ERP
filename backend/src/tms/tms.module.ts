import { Module } from '@nestjs/common';
import { TmsController } from './tms.controller';
import { TmsService } from './tms.service';
import { TmsRepository } from './tms.repository';

@Module({ controllers: [TmsController], providers: [TmsService, TmsRepository] })
export class TmsModule {}
