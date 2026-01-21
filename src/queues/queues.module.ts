import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { StockProcessor } from './stock.processor';
import { OdooModule } from '../odoo/odoo.module';
import { FalabellaModule } from '../falabella/falabella.module';
import { RipleyModule } from '../ripley/ripley.module';
import { ParisModule } from '../paris/paris.module';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'stock-updates',
      defaultJobOptions: {
        attempts: 1,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    OdooModule,
    FalabellaModule,
    RipleyModule,
    ParisModule,
    LogsModule,
  ],
  providers: [StockProcessor],
  exports: [BullModule],
})
export class QueuesModule { }
