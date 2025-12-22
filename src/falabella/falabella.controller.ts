import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Query,
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

  /**
   * Webhook para recibir órdenes de Falabella
   */
  @Post('webhook/order')
  async handleOrderWebhook(
    // @Body() order: FalabellaOrder,
     @Body() order: any,
    @Headers('x-falabella-signature') signature: string,
  ) {
    this.logger.log(`Received order webhook from Falabella: ${order}`);

    await this.logsService.create({
      service: 'falabella',
      action: 'webhook_received',
      status: 'success',
      request: order,
      //orderId: order.orderId,
      metadata: { signature },
    });

    // Agregar a cola de Redis para procesar con Odoo: encolar por cada producto
    // for (const product of (order.products || [])) {
    //   await this.stockQueue.add('reduce-stock', {
    //     orderId: order.orderId,
    //     sku: product.sku,
    //     quantity: product.quantity,
    //     source: 'falabella',
    //   });

    //   this.logger.log(
    //     `Added to queue: reduce stock for SKU ${product.sku} (Order: ${order.orderId})`,
    //   );
    // }

      //   await this.stockQueue.add('reduce-stock', {
      //   order
      // });


    return {
      success: true,
      message: 'Order received and queued for processing',
      order: order,
    };
  }

  /**
   * Actualizar stock de productos en Falabella
   */
  @Post('stock/update')
  async updateStock(
    @Body() body: { products: Array<{ sku: string; quantity: number }> },
  ) {
    try {
      const result = await this.falabellaService.updateStock(body.products);
      return {
        success: true,
        message: 'Stock updated successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update stock',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Obtener productos de Falabella
   */
  @Get('products')
  async getProducts(
    @Query('search') search?: string,
    @Query('limit') limit: number = 100,
    @Query('offset') offset: number = 0,
  ) {
    try {
      const result = await this.falabellaService.getProducts(
        search,
        Number(limit),
        Number(offset),
      );
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get products',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Obtener producto por SKU
   */
  @Get('products/:sku')
  async getProductBySku(@Param('sku') sku: string) {
    try {
      const result = await this.falabellaService.getProductBySku(sku);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Obtener órdenes de Falabella
   */
  @Get('orders')
  async getOrders(
    @Query('createdAfter') createdAfter?: string,
    @Query('createdBefore') createdBefore?: string,
    @Query('limit') limit: number = 100,
    @Query('offset') offset: number = 0,
  ) {
    try {
      const result = await this.falabellaService.getOrders(
        createdAfter,
        createdBefore,
        Number(limit),
        Number(offset),
      );
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Obtener orden específica por ID
   */
  @Get('orders/:orderId')
  async getOrder(@Param('orderId') orderId: string) {
    try {
      const result = await this.falabellaService.getOrder(orderId);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get order',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Marcar items como listos para enviar
   */
  @Post('orders/ready-to-ship')
  async setReadyToShip(
    @Body()
    body: {
      orderItemIds: string[];
      deliveryType?: string;
      shippingProvider?: string;
    },
  ) {
    try {
      const result = await this.falabellaService.setStatusToReadyToShip(
        body.orderItemIds,
        body.deliveryType,
        body.shippingProvider,
      );
      return {
        success: true,
        message: 'Status updated to ready to ship',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
