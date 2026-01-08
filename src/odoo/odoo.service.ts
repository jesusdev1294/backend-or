import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LogsService } from '../logs/logs.service';
import { OdooStockUpdate } from './interfaces/odoo.interface';

@Injectable()
export class OdooService {
  private readonly logger = new Logger(OdooService.name);
  private readonly apiClient: AxiosInstance;

  constructor(
    private configService: ConfigService,
    private logsService: LogsService,
  ) {
    this.apiClient = axios.create({
      baseURL: this.configService.get('ODOO_URL') || 'https://hyperpc3.odoo.com',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Obtiene credenciales de Odoo desde variables de entorno
   */
  private getCredentials() {
    return {
      db: this.configService.get('ODOO_DB') || 'hyperpc3',
      uid: parseInt(this.configService.get('ODOO_UID') || '5'),
      password: this.configService.get('ODOO_API_KEY') || '8344ec0a7f47aa5288aa92f3573584decd83f9c2',
    };
  }

  /**
   * Paso 1: Buscar producto por SKU usando execute_kw
   */
  async searchProductBySku(sku: string): Promise<any> {
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
      const { db, uid, password } = this.getCredentials();

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'product.product',
            'search_read',
            [
              [['default_code', '=', sku]],
              ['id', 'name', 'default_code', 'qty_available'],
            ],
          ],
        },
        id: 1,
      });

      const product = response.data.result?.[0];
      const duration = Date.now() - startTime;

      if (!product) {
        throw new Error(`Product with SKU ${sku} not found in Odoo`);
      }

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: product,
        duration,
      });

      return product;
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

  /**
   * Paso 2: Buscar stock.quant por product_id y location_id
   */
  async getStockQuant(productId: number, locationId: number = 8): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'get_stock_quant',
      status: 'pending',
      request: { productId, locationId },
    };

    try {
      this.logger.log(`Getting stock quant for product ${productId} at location ${locationId}`);
      const { db, uid, password } = this.getCredentials();

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'stock.quant',
            'search_read',
            [
              [
                ['product_id', '=', productId],
                ['location_id', '=', locationId],
              ],
              ['id', 'quantity'],
            ],
          ],
        },
        id: 1,
      });

      const stockQuant = response.data.result?.[0];
      const duration = Date.now() - startTime;

      if (!stockQuant) {
        throw new Error(`Stock quant not found for product ${productId} at location ${locationId}`);
      }

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: stockQuant,
        duration,
      });

      return stockQuant;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error getting stock quant: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reduce stock siguiendo el flujo de 4 pasos de Odoo
   */
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
      const { db, uid, password } = this.getCredentials();

      // Paso 1: Buscar producto por SKU
      const product = await this.searchProductBySku(sku);
      const productId = product.id;
      const currentStock = product.qty_available;

      this.logger.log(`Product found: ID=${productId}, Current Stock=${currentStock}`);

      // Paso 2: Buscar stock.quant
      const stockQuant = await this.getStockQuant(productId, 8);
      const stockQuantId = stockQuant.id;
      const stockQuantQuantity = stockQuant.quantity;

      this.logger.log(`Stock Quant found: ID=${stockQuantId}, Quantity=${stockQuantQuantity}`);

      // Calcular nuevo stock
      const newStock = stockQuantQuantity - quantity;
      if (newStock < 0) {
        throw new Error(`Insufficient stock. Current: ${stockQuantQuantity}, Requested: ${quantity}`);
      }

      // Paso 3: Actualizar inventory_quantity con write
      this.logger.log(`Updating inventory_quantity to ${newStock}`);
      const writeResponse = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'stock.quant',
            'write',
            [[stockQuantId], { inventory_quantity: newStock }],
          ],
        },
        id: 2,
      });

      if (!writeResponse.data.result) {
        throw new Error('Failed to update inventory_quantity');
      }

      this.logger.log('inventory_quantity updated, applying changes...');

      // Paso 4: Aplicar el ajuste con action_apply_inventory
      const applyResponse = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [db, uid, password, 'stock.quant', 'action_apply_inventory', [[stockQuantId]]],
        },
        id: 3,
      });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: {
          productId,
          stockQuantId,
          previousStock: stockQuantQuantity,
          newStock,
          writeResult: writeResponse.data.result,
          applyResult: applyResponse.data,
        },
        duration,
      });

      this.logger.log(`Stock reduced successfully for SKU: ${sku} (${stockQuantQuantity} -> ${newStock})`);
      return {
        success: true,
        productId,
        sku,
        previousStock: stockQuantQuantity,
        newStock,
        quantityReduced: quantity,
      };
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
      const { db, uid, password } = this.getCredentials();

      // Paso 1: Buscar producto por SKU
      const product = await this.searchProductBySku(sku);
      const productId = product.id;

      // Paso 2: Buscar stock.quant
      const stockQuant = await this.getStockQuant(productId, 8);
      const stockQuantId = stockQuant.id;
      const currentStock = stockQuant.quantity;

      // Calcular nuevo stock
      const newStock = currentStock + quantity;

      // Paso 3: Actualizar inventory_quantity
      await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'stock.quant',
            'write',
            [[stockQuantId], { inventory_quantity: newStock }],
          ],
        },
        id: 2,
      });

      // Paso 4: Aplicar el ajuste
      await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [db, uid, password, 'stock.quant', 'action_apply_inventory', [[stockQuantId]]],
        },
        id: 3,
      });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: { productId, previousStock: currentStock, newStock },
        duration,
      });

      this.logger.log(`Stock increased successfully for SKU: ${sku} (${currentStock} -> ${newStock})`);
      return { success: true, productId, sku, previousStock: currentStock, newStock, quantityAdded: quantity };
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

      // Buscar producto (ya trae qty_available)
      const product = await this.searchProductBySku(sku);
      const stock = product.qty_available || 0;

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: { stock, productId: product.id },
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
