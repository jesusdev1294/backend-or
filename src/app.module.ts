import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { LogsModule } from './logs/logs.module';
import { FalabellaModule } from './falabella/falabella.module';
import { OdooModule } from './odoo/odoo.module';
import { QueuesModule } from './queues/queues.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/orquestador'),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    }),
    LogsModule,
    FalabellaModule,
    OdooModule,
    QueuesModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
