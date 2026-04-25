import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportsRepository } from './imports.repository';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ImportsRepository],
  exports: [ImportsService],
})
export class ImportsModule {}
