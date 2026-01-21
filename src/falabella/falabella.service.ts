import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LogsService } from '../logs/logs.service';
import * as crypto from 'crypto';

@Injectable()
export class FalabellaService {
  private readonly logger = new Logger(FalabellaService.name);
  private readonly apiUrl: string;
  private readonly userId: string;
  private readonly apiKey: string;
  private readonly sellerId: string;
  private readonly businessUnit: string;
  private readonly version: string;
  private readonly format: string;

  constructor(
    private configService: ConfigService,
    private logsService: LogsService,
  ) {
    this.apiUrl = this.configService.get('FALABELLA_API_URL') || 'https://sellercenter-api.falabella.com';
    this.userId = this.configService.get('FALABELLA_USER_ID');
    this.apiKey = this.configService.get('FALABELLA_API_KEY');
    this.sellerId = this.configService.get('FALABELLA_SELLER_ID') || 'SCCBA3C';
    this.businessUnit = this.configService.get('FALABELLA_BUSINESS_UNIT') || 'FACL';
    this.version = this.configService.get('FALABELLA_VERSION') || '1.0';
    this.format = this.configService.get('FALABELLA_FORMAT') || 'JSON';
  }

  /**
   * Genera la firma HMAC-SHA256 requerida por la API de Falabella
   * IMPORTANTE: La firma se calcula con valores SIN URL encoding
   * Formato: key=value&key=value (ordenados alfabéticamente, valores raw)
   */
  private generateSignature(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params).sort();
    // NO usar encodeURIComponent aquí - la firma se calcula con valores sin encoding
    const concatenated = sortedKeys.map(key => `${key}=${params[key]}`).join('&');

    this.logger.debug(`Signature string: ${concatenated}`);

    const hmac = crypto.createHmac('sha256', this.apiKey);
    hmac.update(concatenated);
    const signature = hmac.digest('hex');

    this.logger.debug(`Generated signature: ${signature}`);

    return signature;
  }

  /**
   * Obtiene el timestamp en formato ISO 8601 con zona horaria de Chile (UTC-3)
   * Según API Explorer de Falabella: YYYY-MM-DDTHH:MM:SS-03:00
   */
  private getTimestamp(): string {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const timestamp = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
    this.logger.debug(`Generated timestamp: ${timestamp}`);

    return timestamp;
  }

  /**
   * Genera los headers requeridos por Falabella
   * Formato: SELLER_ID/TECNOLOGÍA/VERSIÓN/TIPO_INTEGRACIÓN/CÓDIGO_UNIDAD_NEGOCIO
   */
  private getHeaders(): Record<string, string> {
    return {
      'User-Agent': `${this.sellerId}/node/22.13.0/PROPIA/${this.businessUnit}`,
      'Accept': this.format === 'JSON' ? 'application/json' : 'application/xml',
      'Content-Type': this.format === 'JSON' ? 'application/json' : 'application/xml',
    };
  }

  /**
   * Construye los parámetros base requeridos en cada llamada
   */
  private getBaseParams(action: string, additionalParams: Record<string, string> = {}): Record<string, string> {
    const timestamp = this.getTimestamp();
    const params = {
      Action: action,
      Format: this.format,
      Timestamp: timestamp,
      UserID: this.userId,
      Version: this.version,
      ...additionalParams,
    };

    const signature = this.generateSignature(params);
    return { ...params, Signature: signature };
  }

  /**
   * Construye la URL completa con query string ordenado y encoded
   */
  private buildUrl(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys.map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
    return `${this.apiUrl}?${queryString}`;
  }

  /**
   * Actualiza el stock de productos en Falabella
   */
  async updateStock(products: Array<{ sku: string; quantity: number }>): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'falabella',
      action: 'update_stock',
      status: 'pending',
      request: products,
    };

    try {
      this.logger.log(`Updating stock for ${products.length} products in Falabella`);

      const params = this.getBaseParams('UpdateStock');
      const fullUrl = this.buildUrl(params);

      const body = {
        Request: {
          Product: products.map(p => ({
            SellerSku: p.sku,
            Quantity: p.quantity.toString(),
          })),
        },
      };

      const response = await axios.post(fullUrl, body, { headers: this.getHeaders() });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      this.logger.log(`Stock updated successfully for ${products.length} products`);
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        response: error.response?.data,
        duration,
      });

      this.logger.error(`Error updating stock in Falabella: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene información de productos
   */
  async getProducts(search?: string, limit: number = 100, offset: number = 0): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'falabella',
      action: 'get_products',
      status: 'pending',
      request: { search, limit, offset },
    };

    try {
      this.logger.log(`Getting products from Falabella`);

      const additionalParams: Record<string, string> = { Filter: 'all' };
      if (search) additionalParams['Search'] = search;

      const params = this.getBaseParams('GetProducts', additionalParams);
      const fullUrl = this.buildUrl(params);

      const response = await axios.get(fullUrl, { headers: this.getHeaders() });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        response: error.response?.data,
        duration,
      });

      this.logger.error(`Error getting products from Falabella: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene órdenes de Falabella
   */
  async getOrders(
    createdAfter?: string,
    createdBefore?: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'falabella',
      action: 'get_orders',
      status: 'pending',
      request: { createdAfter, createdBefore, limit, offset },
    };

    try {
      this.logger.log(`Getting orders from Falabella`);

      const additionalParams: Record<string, string> = {};
      if (createdAfter) additionalParams['CreatedAfter'] = createdAfter;
      if (createdBefore) additionalParams['CreatedBefore'] = createdBefore;

      const params = this.getBaseParams('GetOrders', additionalParams);
      const fullUrl = this.buildUrl(params);

      const response = await axios.get(fullUrl, { headers: this.getHeaders() });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        response: error.response?.data,
        duration,
      });

      this.logger.error(`Error getting orders from Falabella: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene una orden específica por ID
   */
  async getOrder(orderId: string): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'falabella',
      action: 'get_order',
      status: 'pending',
      request: { orderId },
      orderId,
    };

    try {
      this.logger.log(`Getting order ${orderId} from Falabella`);

      const params = this.getBaseParams('GetOrder', { OrderId: orderId });
      const fullUrl = this.buildUrl(params);

      const response = await axios.get(fullUrl, { headers: this.getHeaders() });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        response: error.response?.data,
        duration,
      });

      this.logger.error(`Error getting order from Falabella: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene los items de una orden específica por ID
   */
  async getOrderItems(orderId: string): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'falabella',
      action: 'get_order_items',
      status: 'pending',
      request: { orderId },
      orderId,
    };

    try {
      this.logger.log(`Getting order items for order ${orderId} from Falabella`);

      const params = this.getBaseParams('GetOrderItems', { OrderId: orderId });
      const fullUrl = this.buildUrl(params);

      // Log detallado para debugging
      this.logger.debug(`Full URL: ${fullUrl}`);
      this.logger.debug(`Params: ${JSON.stringify(params, null, 2)}`);

      const response = await axios.get(fullUrl, { headers: this.getHeaders() });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        response: error.response?.data,
        duration,
      });

      this.logger.error(`Error getting order items from Falabella: ${error.message}`);
      throw error;
    }
  }

  /**
   * Marca una orden como "Lista para enviar"
   */
  async setStatusToReadyToShip(
    orderItemIds: string[],
    deliveryType: string = 'dropship',
    shippingProvider?: string,
  ): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'falabella',
      action: 'set_ready_to_ship',
      status: 'pending',
      request: { orderItemIds, deliveryType, shippingProvider },
    };

    try {
      this.logger.log(`Setting ${orderItemIds.length} items to ready to ship`);

      const params = this.getBaseParams('SetStatusToReadyToShip');
      const fullUrl = this.buildUrl(params);

      const body = {
        Request: {
          OrderItem: orderItemIds.map(id => ({
            OrderItemId: id.toString(),
            DeliveryType: deliveryType,
            ...(shippingProvider && { ShippingProvider: shippingProvider }),
          })),
        },
      };

      const response = await axios.post(fullUrl, body, { headers: this.getHeaders() });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      this.logger.log(`Status updated to ready to ship for ${orderItemIds.length} items`);
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        response: error.response?.data,
        duration,
      });

      this.logger.error(`Error setting status to ready to ship: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene el stock actual de un producto por SKU
   */
  async getProductBySku(sku: string): Promise<any> {
    const startTime = Date.now();

    try {
      this.logger.log(`Getting product info for SKU: ${sku}`);

      const params = this.getBaseParams('GetProducts', { Filter: 'all', Search: sku });
      const fullUrl = this.buildUrl(params);

      const response = await axios.get(fullUrl, { headers: this.getHeaders() });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'falabella',
        action: 'get_product_by_sku',
        status: 'success',
        request: { sku },
        response: response.data,
        duration,
        productSku: sku,
      });

      return response.data;
    } catch (error) {
      await this.logsService.create({
        service: 'falabella',
        action: 'get_product_by_sku',
        status: 'error',
        request: { sku },
        errorMessage: error.message,
        productSku: sku,
      });

      this.logger.error(`Error getting product by SKU: ${error.message}`);
      throw error;
    }
  }

  async validateWebhookSignature(payload: any, signature: string): Promise<boolean> {
    const webhookSecret = this.configService.get('FALABELLA_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.warn('FALABELLA_WEBHOOK_SECRET not configured');
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expectedSignature;
  }
}
