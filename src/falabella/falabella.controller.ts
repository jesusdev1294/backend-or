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
   * Flujo completo: Webhook → getOrder → getOrderItems → Odoo (processMarketplaceOrder)
   * Crea: Partner (cliente) → Sale Order → Confirma → Reduce Stock
   */
  @Post('webhook/order')
  async handleOrderWebhook(
    @Body() body: any,
    @Headers('x-falabella-signature') signature: string,
  ) {
    // Extraer orderId desde diferentes estructuras posibles
    const orderId = body.payload?.OrderId || body.orderId || body.OrderId;

    this.logger.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    this.logger.log(`📥 Falabella Webhook: Order ${orderId}`);
    this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

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

      // Paso 1: Obtener información completa de la orden (datos del cliente)
      this.logger.log(`🔍 Paso 1: Fetching order details for OrderId: ${orderId}`);
      const orderResponse = await this.falabellaService.getOrder(orderId);
      const orderData = orderResponse?.SuccessResponse?.Body?.Orders?.Order;

      if (!orderData) {
        throw new Error(`Order data not found for OrderId: ${orderId}`);
      }

      // Extraer datos del cliente desde la orden
      const addressShipping = orderData.AddressShipping || {};
      const addressBilling = orderData.AddressBilling || {};

      // Paso 2: Obtener items de la orden
      this.logger.log(`🔍 Paso 2: Fetching order items for OrderId: ${orderId}`);
      const orderItemsResponse = await this.falabellaService.getOrderItems(orderId);
      const orderItems = orderItemsResponse?.SuccessResponse?.Body?.OrderItems?.OrderItem;

      // Manejar tanto un solo item como array de items
      const rawItems = Array.isArray(orderItems) ? orderItems : [orderItems];

      // Mapear items al formato esperado por processMarketplaceOrder
      const items = rawItems
        .filter((item: any) => item?.Sku)
        .map((item: any) => ({
          sku: item.Sku,
          quantity: parseInt(item.Quantity) || 1,
          price: parseFloat(item.ItemPrice) || 0,
          name: item.Name || '',
        }));

      this.logger.log(`📦 Items to process: ${items.length}`);

      // Paso 3: Procesar orden completa en Odoo (crear cliente, orden, confirmar, reducir stock)
      this.logger.log(`🔍 Paso 3: Processing order in Odoo with full flow`);
      const result = await this.odooService.processMarketplaceOrder({
        marketplace: 'falabella',
        orderId: orderId,
        customer: {
          name: `${orderData.CustomerFirstName || ''} ${orderData.CustomerLastName || ''}`.trim() || 'Cliente Falabella',
          email: orderData.CustomerEmail || `falabella-${orderId}@temp.cl`,
          phone: addressShipping.Phone || addressBilling.Phone,
          nationalId: orderData.NationalRegistrationNumber || addressBilling.NationalRegistrationNumber,
          legalId: addressBilling.NationalRegistrationNumber,
          billingName: addressBilling.Company || `${addressBilling.FirstName || ''} ${addressBilling.LastName || ''}`.trim(),
          billingStreet: addressBilling.Address1,
          billingCity: addressBilling.City,
        },
        items,
        shippingPrice: parseFloat(orderData.ShippingFee) || 0,
      });

      this.logger.log(`✅ Order processed in Odoo. Sale Order ID: ${result.saleOrderId}`);

      // Paso 4: Agregar jobs a la cola para sincronizar stock a otros marketplaces
      for (const item of items) {
        const stockUpdate = result.stockUpdates.find((s: any) => s.sku === item.sku);
        if (stockUpdate) {
          await this.stockQueue.add('reduce-stock', {
            orderId,
            sku: item.sku,
            quantity: item.quantity,
            source: 'falabella',
            newStock: stockUpdate.newStock,
          });
          this.logger.log(`📤 Stock sync queued for SKU: ${item.sku}, newStock: ${stockUpdate.newStock}`);
        }
      }

      // Registrar resultado final
      await this.logsService.create({
        service: 'falabella',
        action: 'webhook_processing_completed',
        status: 'success',
        request: { orderId, itemCount: items.length },
        response: {
          saleOrderId: result.saleOrderId,
          partnerId: result.partnerId,
          stockUpdates: result.stockUpdates,
        },
        orderId,
      });

      this.logger.log(`✅ Orden ${orderId} procesada exitosamente`);

      return {
        success: true,
        message: 'Order processed successfully',
        orderId: orderId,
        saleOrderId: result.saleOrderId,
        itemsProcessed: items.length,
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
