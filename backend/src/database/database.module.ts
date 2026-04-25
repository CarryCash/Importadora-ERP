import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { MigrationController } from './migration.controller';

@Global()
@Module({
  controllers: [MigrationController],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
