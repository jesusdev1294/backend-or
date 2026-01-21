import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { LogsModule } from './logs/logs.module';
import { FalabellaModule } from './falabella/falabella.module';
import { OdooModule } from './odoo/odoo.module';
import { QueuesModule } from './queues/queues.module';
import { RipleyModule } from './ripley/ripley.module';
import { ParisModule } from './paris/paris.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/orquestador'),
    BullModule.forRoot({
      redis: process.env.REDIS_URL
        ? process.env.REDIS_URL // Railway format
        : {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
        },
    }),
    LogsModule,
    FalabellaModule,
    OdooModule,
    QueuesModule,
    RipleyModule,
    ParisModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule { }
