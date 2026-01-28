import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WalmartController } from './walmart.controller';
import { WalmartService } from './walmart.service';
import { LogsModule } from '../logs/logs.module';

@Module({
    imports: [ConfigModule, LogsModule],
    controllers: [WalmartController],
    providers: [WalmartService],
    exports: [WalmartService],
})
export class WalmartModule { }
