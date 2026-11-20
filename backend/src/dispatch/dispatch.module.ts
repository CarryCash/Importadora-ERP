import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { DispatchRepository } from './dispatch.repository';

@Module({ controllers: [DispatchController], providers: [DispatchService, DispatchRepository] })
export class DispatchModule {}
