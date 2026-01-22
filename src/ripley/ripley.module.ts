import { Module } from '@nestjs/common';
import { RipleyService } from './ripley.service';
import { RipleyController } from './ripley.controller';
import { LogsModule } from '../logs/logs.module';
import { OdooModule } from '../odoo/odoo.module';

@Module({
    imports: [
        LogsModule,
        OdooModule,
    ],
    controllers: [RipleyController],
    providers: [RipleyService],
    exports: [RipleyService],
})
export class RipleyModule { }
