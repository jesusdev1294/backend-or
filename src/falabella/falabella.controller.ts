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
import { OdooService } from '../odoo/odoo.service';
import { FalabellaOrder } from './interfaces/falabella.interface';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Controller('falabella')
export class FalabellaController {
  private readonly logger = new Logger(FalabellaController.name);

  constructor(
    private readonly falabellaService: FalabellaService,
    private readonly odooService: OdooService,
    private readonly logsService: LogsService,
    @InjectQueue('stock-updates') private stockQueue: Queue,
  ) {}

  /**
   * Webhook para recibir órdenes de Falabella
   * Flujo: Webhook → getOrderItems → Odoo (searchProduct → getStockQuant → reduceStock)
   */
  @Post('webhook/order')
  async handleOrderWebhook(
    @Body() body: any,
    @Headers('x-falabella-signature') signature: string,
  ) {
    // Extraer orderId desde diferentes estructuras posibles
    const orderId = body.payload?.OrderId || body.orderId || body.OrderId;
    
    this.logger.log(`Received order webhook from Falabella. Event: ${body.event || 'N/A'}, OrderId: ${orderId || 'N/A'}`);

    // Registrar recepción del webhook
    await this.logsService.create({
      service: 'falabella',
      action: 'webhook_received',
      status: 'success',
      request: body,
      orderId: orderId,
      metadata: { 
        signature,
        event: body.event,
        newStatus: body.payload?.NewStatus,
      },
    });

    try {
      // Validar que tenemos orderId
      if (!orderId) {
        throw new Error('OrderId not found in webhook payload');
      }

      this.logger.log(`🔍 Paso 1: Fetching order items for OrderId: ${orderId}`);
      const orderItemsResponse = await this.falabellaService.getOrderItems(orderId);

      // Extraer items de la respuesta
      const orderItems = orderItemsResponse?.SuccessResponse?.Body?.OrderItems?.OrderItem;
      
      // Manejar tanto un solo item como array de items
      const items = Array.isArray(orderItems) ? orderItems : [orderItems];
      const processedItems = [];

      // Procesar cada item secuencialmente
      for (const item of items) {
        if (item?.Sku) {
          const sku = item.Sku;
          const quantity = 1; // Falabella generalmente envía 1 unidad por OrderItem

          this.logger.log(`\n📦 Processing item: ${item.Name} (SKU: ${sku})`);

          try {
            // Paso 2: Buscar producto en Odoo por SKU
            this.logger.log(`🔍 Paso 2: Searching product in Odoo for SKU: ${sku}`);
            const product = await this.odooService.searchProductBySku(sku);
            this.logger.log(`✅ Product found: ID=${product.id}, Stock=${product.qty_available}`);

            // Paso 3: Obtener stock.quant del producto
            this.logger.log(`🔍 Paso 3: Getting stock quant for product ${product.id}`);
            const stockQuant = await this.odooService.getStockQuant(product.id, 8);
            this.logger.log(`✅ Stock Quant found: ID=${stockQuant.id}, Quantity=${stockQuant.quantity}`);

            // Paso 4: Reducir stock en Odoo (ejecuta los 4 pasos internos)
            this.logger.log(`📉 Paso 4: Reducing stock for SKU: ${sku}, Quantity: ${quantity}`);
            const result = await this.odooService.reduceStock(sku, quantity, orderId);
            this.logger.log(`✅ Stock reduced: ${result.previousStock} → ${result.newStock}`);

            processedItems.push({
              sku,
              orderItemId: item.OrderItemId,
              name: item.Name,
              previousStock: result.previousStock,
              newStock: result.newStock,
              success: true,
            });
          } catch (itemError) {
            this.logger.error(`❌ Error processing SKU ${sku}: ${itemError.message}`);
            processedItems.push({
              sku,
              orderItemId: item.OrderItemId,
              name: item.Name,
              success: false,
              error: itemError.message,
            });
          }
        }
      }

      // Registrar resultado final
      await this.logsService.create({
        service: 'falabella',
        action: 'webhook_processing_completed',
        status: 'success',
        request: { orderId, itemCount: items.length },
        response: { processedItems },
        orderId,
      });

      return {
        success: true,
        message: 'Order processed successfully',
        orderId: orderId,
        itemsProcessed: processedItems.length,
        items: processedItems,
      };
    } catch (error) {
      this.logger.error(`❌ Error processing webhook: ${error.message}`);
      
      await this.logsService.create({
        service: 'falabella',
        action: 'webhook_processing_error',
        status: 'error',
        request: body,
        errorMessage: error.message,
        orderId: body.payload?.OrderId || body.orderId || body.OrderId,
      });

      throw new HttpException(
        `Failed to process webhook: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
