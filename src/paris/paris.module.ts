import { Module } from '@nestjs/common';
import { ParisService } from './paris.service';
import { ParisController } from './paris.controller';
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
    controllers: [ParisController],
    providers: [ParisService],
    exports: [ParisService],
})
export class ParisModule { }
