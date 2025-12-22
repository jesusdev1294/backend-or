import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { OdooService } from '../odoo/odoo.service';
import { FalabellaService } from '../falabella/falabella.service';
import { LogsService } from '../logs/logs.service';

@Processor('stock-updates')
export class StockProcessor {
  private readonly logger = new Logger(StockProcessor.name);

  constructor(
    private readonly odooService: OdooService,
    private readonly falabellaService: FalabellaService,
    private readonly logsService: LogsService,
  ) {}

  @Process('reduce-stock')
  async handleReduceStock(job: Job) {
    const { orderId, sku, quantity, source } = job.data;

    this.logger.log(
      `Processing stock reduction: SKU ${sku}, Quantity ${quantity}, Source ${source}`,
    );

    const startTime = Date.now();

    try {
      // Reducir stock en Odoo
      await this.odooService.reduceStock(sku, quantity, orderId);

      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'orchestrator',
        action: 'stock_reduction_completed',
        status: 'success',
        request: job.data,
        duration,
        orderId,
        productSku: sku,
      });

      this.logger.log(
        `Stock reduction completed: SKU ${sku}, Order ${orderId}`,
      );
      
      return { success: true, sku, quantity, orderId };
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'orchestrator',
        action: 'stock_reduction_failed',
        status: 'error',
        request: job.data,
        errorMessage: error.message,
        duration,
        orderId,
        productSku: sku,
      });

      this.logger.error(
        `Stock reduction failed: SKU ${sku}, Error: ${error.message}`,
      );

      throw error;
    }
  }

  @Process('update-marketplace')
  async handleUpdateMarketplace(job: Job) {
    const { sku, quantity, marketplace, source } = job.data;

    this.logger.log(
      `Processing marketplace update: ${marketplace}, SKU ${sku}, Quantity ${quantity}`,
    );

    const startTime = Date.now();

    try {
      if (marketplace === 'falabella') {
        // Actualizar stock en Falabella
        await this.falabellaService.updateStock([{
          sku,
          quantity,
        }]);
      }

      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'orchestrator',
        action: 'marketplace_update_completed',
        status: 'success',
        request: job.data,
        duration,
        productSku: sku,
      });

      this.logger.log(
        `Marketplace update completed: ${marketplace}, SKU ${sku}`,
      );

      return { success: true, marketplace, sku, quantity };
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'orchestrator',
        action: 'marketplace_update_failed',
        status: 'error',
        request: job.data,
        errorMessage: error.message,
        duration,
        productSku: sku,
      });

      this.logger.error(
        `Marketplace update failed: ${marketplace}, SKU ${sku}, Error: ${error.message}`,
      );

      throw error;
    }
  }

  @Process('sync-stock')
  async handleSyncStock(job: Job) {
    const { sku } = job.data;

    this.logger.log(`Processing stock sync for SKU: ${sku}`);

    const startTime = Date.now();

    try {
      // Obtener stock actual de Odoo
      const odooStock = await this.odooService.getStockBySku(sku);

      // Actualizar en Falabella
      await this.falabellaService.updateStock([{
        sku,
        quantity: odooStock,
      }]);

      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'orchestrator',
        action: 'stock_sync_completed',
        status: 'success',
        request: { sku },
        response: { odooStock },
        duration,
        productSku: sku,
      });

      this.logger.log(`Stock sync completed for SKU: ${sku}`);

      return { success: true, sku, odooStock };
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'orchestrator',
        action: 'stock_sync_failed',
        status: 'error',
        request: { sku },
        errorMessage: error.message,
        duration,
        productSku: sku,
      });

      this.logger.error(`Stock sync failed for SKU: ${sku}, Error: ${error.message}`);

      throw error;
    }
  }
}
