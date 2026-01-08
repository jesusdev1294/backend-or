import { Module } from '@nestjs/common';
import { FalabellaService } from './falabella.service';
import { FalabellaController } from './falabella.controller';
import { LogsModule } from '../logs/logs.module';
import { OdooModule } from '../odoo/odoo.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    LogsModule,
    OdooModule,
    BullModule.registerQueue({
      name: 'stock-updates',
    }),
  ],
  controllers: [FalabellaController],
  providers: [FalabellaService],
  exports: [FalabellaService],
})
export class FalabellaModule {}
