import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LogsService } from '../logs/logs.service';
import { FalabellaStockUpdate } from './interfaces/falabella.interface';

@Injectable()
export class FalabellaService {
  private readonly logger = new Logger(FalabellaService.name);
  private readonly apiClient: AxiosInstance;

  constructor(
    private configService: ConfigService,
    private logsService: LogsService,
  ) {
    this.apiClient = axios.create({
      baseURL: this.configService.get('FALABELLA_API_URL'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.configService.get('FALABELLA_API_KEY')}`,
      },
      timeout: 10000,
    });
  }

  async updateStock(stockUpdate: FalabellaStockUpdate): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'falabella',
      action: 'stock_update',
      status: 'pending',
      request: stockUpdate,
      productSku: stockUpdate.sku,
    };

    try {
      this.logger.log(`Updating stock in Falabella for SKU: ${stockUpdate.sku}`);
      
      const response = await this.apiClient.post('/stock/update', stockUpdate);
      
      const duration = Date.now() - startTime;
      
      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      this.logger.log(`Stock updated successfully for SKU: ${stockUpdate.sku}`);
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

  async getProductInfo(sku: string): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'falabella',
      action: 'get_product',
      status: 'pending',
      request: { sku },
      productSku: sku,
    };

    try {
      this.logger.log(`Getting product info from Falabella for SKU: ${sku}`);
      
      const response = await this.apiClient.get(`/products/${sku}`);
      
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

      this.logger.error(`Error getting product from Falabella: ${error.message}`);
      throw error;
    }
  }

  async validateWebhookSignature(payload: any, signature: string): Promise<boolean> {
    // Implementar validación de firma según documentación de Falabella
    const expectedSignature = this.configService.get('FALABELLA_WEBHOOK_SECRET');
    return signature === expectedSignature;
  }
}
