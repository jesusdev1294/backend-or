import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LogsService } from '../logs/logs.service';
import { OdooStockUpdate } from './interfaces/odoo.interface';

@Injectable()
export class OdooService {
  private readonly logger = new Logger(OdooService.name);
  private readonly apiClient: AxiosInstance;
  private sessionId: string;

  constructor(
    private configService: ConfigService,
    private logsService: LogsService,
  ) {
    this.apiClient = axios.create({
      baseURL: this.configService.get('ODOO_URL'),
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  async authenticate(): Promise<void> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'authenticate',
      status: 'pending',
      request: {
        db: this.configService.get('ODOO_DB'),
        username: this.configService.get('ODOO_USERNAME'),
      },
    };

    try {
      this.logger.log('Authenticating with Odoo...');

      const response = await this.apiClient.post('/web/session/authenticate', {
        jsonrpc: '2.0',
        params: {
          db: this.configService.get('ODOO_DB'),
          login: this.configService.get('ODOO_USERNAME'),
          password: this.configService.get('ODOO_PASSWORD'),
        },
      });

      this.sessionId = response.data.result.session_id;
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        duration,
      });

      this.logger.log('Successfully authenticated with Odoo');
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error authenticating with Odoo: ${error.message}`);
      throw error;
    }
  }

  async searchProductBySku(sku: string): Promise<number> {
    if (!this.sessionId) {
      await this.authenticate();
    }

    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'search_product',
      status: 'pending',
      request: { sku },
      productSku: sku,
    };

    try {
      this.logger.log(`Searching product in Odoo by SKU: ${sku}`);

      const response = await this.apiClient.post(
        '/web/dataset/call_kw',
        {
          jsonrpc: '2.0',
          params: {
            model: 'product.product',
            method: 'search',
            args: [[['default_code', '=', sku]]],
            kwargs: {},
          },
        },
        {
          headers: { Cookie: `session_id=${this.sessionId}` },
        },
      );

      const productId = response.data.result[0];
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: { productId },
        duration,
      });

      return productId;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error searching product in Odoo: ${error.message}`);
      throw error;
    }
  }

  async reduceStock(sku: string, quantity: number, orderId?: string): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'reduce_stock',
      status: 'pending',
      request: { sku, quantity },
      productSku: sku,
      orderId,
    };

    try {
      this.logger.log(`Reducing stock in Odoo for SKU: ${sku}, Quantity: ${quantity}`);

      // Buscar producto por SKU
      const productId = await this.searchProductBySku(sku);

      if (!productId) {
        throw new Error(`Product with SKU ${sku} not found in Odoo`);
      }

      // Crear movimiento de stock (salida)
      const response = await this.apiClient.post(
        '/web/dataset/call_kw',
        {
          jsonrpc: '2.0',
          params: {
            model: 'stock.quant',
            method: 'create',
            args: [
              {
                product_id: productId,
                quantity: -quantity, // Negativo para reducir
                location_id: 8, // ID de ubicación, ajustar según tu configuración
              },
            ],
            kwargs: {},
          },
        },
        {
          headers: { Cookie: `session_id=${this.sessionId}` },
        },
      );

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      this.logger.log(`Stock reduced successfully for SKU: ${sku}`);
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error reducing stock in Odoo: ${error.message}`);
      throw error;
    }
  }

  async increaseStock(sku: string, quantity: number): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'increase_stock',
      status: 'pending',
      request: { sku, quantity },
      productSku: sku,
    };

    try {
      this.logger.log(`Increasing stock in Odoo for SKU: ${sku}, Quantity: ${quantity}`);

      const productId = await this.searchProductBySku(sku);

      if (!productId) {
        throw new Error(`Product with SKU ${sku} not found in Odoo`);
      }

      const response = await this.apiClient.post(
        '/web/dataset/call_kw',
        {
          jsonrpc: '2.0',
          params: {
            model: 'stock.quant',
            method: 'create',
            args: [
              {
                product_id: productId,
                quantity: quantity, // Positivo para aumentar
                location_id: 8,
              },
            ],
            kwargs: {},
          },
        },
        {
          headers: { Cookie: `session_id=${this.sessionId}` },
        },
      );

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      this.logger.log(`Stock increased successfully for SKU: ${sku}`);
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error increasing stock in Odoo: ${error.message}`);
      throw error;
    }
  }

  async getStockBySku(sku: string): Promise<number> {
    if (!this.sessionId) {
      await this.authenticate();
    }

    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'get_stock',
      status: 'pending',
      request: { sku },
      productSku: sku,
    };

    try {
      this.logger.log(`Getting stock from Odoo for SKU: ${sku}`);

      const productId = await this.searchProductBySku(sku);

      const response = await this.apiClient.post(
        '/web/dataset/call_kw',
        {
          jsonrpc: '2.0',
          params: {
            model: 'product.product',
            method: 'read',
            args: [[productId], ['qty_available']],
            kwargs: {},
          },
        },
        {
          headers: { Cookie: `session_id=${this.sessionId}` },
        },
      );

      const stock = response.data.result[0]?.qty_available || 0;
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: { stock },
        duration,
      });

      return stock;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error getting stock from Odoo: ${error.message}`);
      throw error;
    }
  }
}
