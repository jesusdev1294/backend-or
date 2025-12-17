import { Module } from '@nestjs/common';
import { OdooService } from './odoo.service';
import { OdooController } from './odoo.controller';
import { LogsModule } from '../logs/logs.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    LogsModule,
    BullModule.registerQueue({
      name: 'stock-updates',
    }),
  ],
  controllers: [OdooController],
  providers: [OdooService],
  exports: [OdooService],
})
export class OdooModule {}
