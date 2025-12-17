import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { StockProcessor } from './stock.processor';
import { OdooModule } from '../odoo/odoo.module';
import { FalabellaModule } from '../falabella/falabella.module';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'stock-updates',
    }),
    OdooModule,
    FalabellaModule,
    LogsModule,
  ],
  providers: [StockProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
