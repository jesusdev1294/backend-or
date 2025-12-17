import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FalabellaService } from './falabella.service';
import { LogsService } from '../logs/logs.service';
import { FalabellaOrder } from './interfaces/falabella.interface';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Controller('falabella')
export class FalabellaController {
  private readonly logger = new Logger(FalabellaController.name);

  constructor(
    private readonly falabellaService: FalabellaService,
    private readonly logsService: LogsService,
    @InjectQueue('stock-updates') private stockQueue: Queue,
  ) {}

  @Post('webhook/order')
  async handleOrderWebhook(
    @Body() order: FalabellaOrder,
    @Headers('x-falabella-signature') signature: string,
  ) {
    this.logger.log(`Received order webhook from Falabella: ${order.orderId}`);

    // Log inicial
    await this.logsService.create({
      service: 'falabella',
      action: 'webhook_received',
      status: 'success',
      request: order,
      orderId: order.orderId,
      metadata: { signature },
    });

    // Validar firma del webhook
    const isValid = await this.falabellaService.validateWebhookSignature(
      order,
      signature,
    );

    if (!isValid) {
      await this.logsService.create({
        service: 'falabella',
        action: 'webhook_validation',
        status: 'error',
        errorMessage: 'Invalid webhook signature',
        orderId: order.orderId,
      });

      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }

    // Agregar a cola de Redis para procesar con Odoo
    for (const product of order.products) {
      await this.stockQueue.add('reduce-stock', {
        orderId: order.orderId,
        sku: product.sku,
        quantity: product.quantity,
        source: 'falabella',
      });

      this.logger.log(
        `Added to queue: reduce stock for SKU ${product.sku} (Order: ${order.orderId})`,
      );
    }

    return {
      success: true,
      message: 'Order received and queued for processing',
      orderId: order.orderId,
    };
  }

  @Post('webhook/stock')
  async handleStockWebhook(@Body() payload: any) {
    this.logger.log('Received stock webhook from Falabella');

    await this.logsService.create({
      service: 'falabella',
      action: 'stock_webhook_received',
      status: 'success',
      request: payload,
    });

    return { success: true };
  }
}
