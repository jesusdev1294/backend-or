import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LogsService } from './logs/logs.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Habilitar CORS para acceso externo
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global logging interceptor
  const logsService = app.get(LogsService);
  app.useGlobalInterceptors(new LoggingInterceptor(logsService));
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 Orquestador running on: http://localhost:${port}`);
  console.log(`📊 Logs endpoint: http://localhost:${port}/logs`);
  console.log(`🛒 Falabella webhook: http://localhost:${port}/falabella/webhook/order`);
  console.log(`📦 Odoo webhook: http://localhost:${port}/odoo/webhook/stock-change`);
}

bootstrap();
