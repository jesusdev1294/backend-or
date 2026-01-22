import { Module } from '@nestjs/common';
import { ParisService } from './paris.service';
import { ParisController } from './paris.controller';
import { LogsModule } from '../logs/logs.module';
import { OdooModule } from '../odoo/odoo.module';

@Module({
    imports: [
        LogsModule,
        OdooModule,
    ],
    controllers: [ParisController],
    providers: [ParisService],
    exports: [ParisService],
})
export class ParisModule { }
