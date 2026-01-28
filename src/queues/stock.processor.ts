import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bull';
import { OdooService } from '../odoo/odoo.service';
import { FalabellaService } from '../falabella/falabella.service';
import { RipleyService } from '../ripley/ripley.service';
import { ParisService } from '../paris/paris.service';
import { WalmartService } from '../walmart/walmart.service';
import { LogsService } from '../logs/logs.service';

// Interfaces para futuros servicios de marketplace
interface MarketplaceService {
  updateStock(products: Array<{ sku: string; quantity: number }>): Promise<any>;
}

// Registro de marketplaces disponibles
const AVAILABLE_MARKETPLACES = ['falabella', 'ripley', 'paris', 'walmart'] as const;
type MarketplaceName = typeof AVAILABLE_MARKETPLACES[number];

@Processor('stock-updates')
export class StockProcessor {
  private readonly logger = new Logger(StockProcessor.name);

  // Mapa de servicios de marketplace (se irán agregando cuando se implementen)
  private marketplaceServices: Map<MarketplaceName, MarketplaceService>;

  constructor(
    private readonly odooService: OdooService,
    private readonly falabellaService: FalabellaService,
    @Inject(forwardRef(() => RipleyService)) private readonly ripleyService: RipleyService,
    @Inject(forwardRef(() => ParisService)) private readonly parisService: ParisService,
    @Inject(forwardRef(() => WalmartService)) private readonly walmartService: WalmartService,
    private readonly logsService: LogsService,
  ) {
    this.marketplaceServices = new Map();
    this.marketplaceServices.set('falabella', this.falabellaService);
    this.marketplaceServices.set('ripley', this.ripleyService);
    this.marketplaceServices.set('paris', this.parisService);
    this.marketplaceServices.set('walmart', this.walmartService);
  }

  /**
   * Reduce stock en Odoo y sincroniza a TODOS los marketplaces
   * Flujo completo de una venta
   */
  @Process({ name: 'reduce-stock', concurrency: 1 })
  async handleReduceStock(job: Job) {
    const { orderId, sku, quantity, source, newStock } = job.data;

    this.logger.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    this.logger.log(`📦 Processing: SKU ${sku}, Qty ${quantity}, From ${source}`);
    this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const startTime = Date.now();
    let finalStock = newStock;

    try {
      // Si no nos pasaron el nuevo stock, calcularlo reduciendo en Odoo
      if (finalStock === undefined) {
        const result = await this.odooService.reduceStock(sku, quantity, orderId);
        finalStock = result.newStock;
        this.logger.log(`✅ Stock reducido en Odoo: ${result.previousStock} → ${finalStock}`);
      }

      // Sincronizar a TODOS los marketplaces (excepto el origen)
      const syncResults = await this.syncToAllMarketplaces(sku, finalStock, source, orderId);

      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'orchestrator',
        action: 'stock_reduction_completed',
        status: 'success',
        request: job.data,
        response: { finalStock, syncResults },
        duration,
        orderId,
        productSku: sku,
      });

      this.logger.log(`\n✅ Proceso completado en ${duration}ms`);
      this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      return { success: true, sku, quantity, orderId, finalStock, syncResults };
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

      this.logger.error(`❌ Stock reduction failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sincroniza stock a TODOS los marketplaces excepto el origen
   * Continúa aunque falle alguno, loguea errores individuales
   */
  private async syncToAllMarketplaces(
    sku: string,
    newStock: number,
    origin: string,
    orderId?: string,
  ): Promise<Record<string, { success: boolean; error?: string }>> {
    const results: Record<string, { success: boolean; error?: string }> = {};

    // Obtener marketplaces a sincronizar (excluir origen)
    const targetsToSync = AVAILABLE_MARKETPLACES.filter(
      (mp) => mp.toLowerCase() !== origin?.toLowerCase(),
    );

    this.logger.log(`\n🔄 Sincronizando a: [${targetsToSync.join(', ')}]`);
    this.logger.log(`   (Origen ${origin} excluido)`);

    // Procesar en paralelo con Promise.allSettled (no falla si uno falla)
    const syncPromises = targetsToSync.map(async (marketplace) => {
      const service = this.marketplaceServices.get(marketplace);

      if (!service) {
        this.logger.warn(`⚠️ ${marketplace}: Servicio no implementado aún`);
        return { marketplace, success: false, error: 'Service not implemented' };
      }

      const startTime = Date.now();

      try {
        await service.updateStock([{ sku, quantity: newStock }]);
        const duration = Date.now() - startTime;

        this.logger.log(`✅ ${marketplace}: Stock actualizado a ${newStock} (${duration}ms)`);

        await this.logsService.create({
          service: 'orchestrator',
          action: `sync_${marketplace}_success`,
          status: 'success',
          request: { sku, newStock },
          duration,
          orderId,
          productSku: sku,
        });

        return { marketplace, success: true };
      } catch (error) {
        const duration = Date.now() - startTime;

        this.logger.error(`❌ ${marketplace}: Error - ${error.message}`);

        await this.logsService.create({
          service: 'orchestrator',
          action: `sync_${marketplace}_failed`,
          status: 'error',
          request: { sku, newStock },
          errorMessage: error.message,
          duration,
          orderId,
          productSku: sku,
        });

        // NO lanzamos error, solo retornamos el resultado
        return { marketplace, success: false, error: error.message };
      }
    });

    const settledResults = await Promise.all(syncPromises);

    // Construir objeto de resultados
    for (const result of settledResults) {
      results[result.marketplace] = {
        success: result.success,
        error: result.error,
      };
    }

    // Resumen
    const successCount = Object.values(results).filter((r) => r.success).length;
    const failCount = Object.values(results).filter((r) => !r.success).length;
    this.logger.log(`\n📊 Sync Summary: ${successCount} OK, ${failCount} Failed`);

    return results;
  }

  /**
   * Actualizar stock en un marketplace específico
   */
  @Process({ name: 'update-marketplace', concurrency: 2 })
  async handleUpdateMarketplace(job: Job) {
    const { sku, quantity, marketplace } = job.data;

    this.logger.log(`Processing update: ${marketplace}, SKU ${sku}, Qty ${quantity}`);

    const startTime = Date.now();
    const service = this.marketplaceServices.get(marketplace as MarketplaceName);

    if (!service) {
      this.logger.warn(`Service ${marketplace} not implemented yet`);
      return { success: false, marketplace, error: 'Not implemented' };
    }

    try {
      await service.updateStock([{ sku, quantity }]);

      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'orchestrator',
        action: 'marketplace_update_completed',
        status: 'success',
        request: job.data,
        duration,
        productSku: sku,
      });

      this.logger.log(`✅ ${marketplace} updated: ${sku} = ${quantity}`);
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

      this.logger.error(`❌ ${marketplace} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sincronizar stock de Odoo a TODOS los marketplaces (refresh)
   */
  @Process({ name: 'sync-stock', concurrency: 1 })
  async handleSyncStock(job: Job) {
    const { sku } = job.data;

    this.logger.log(`\n🔃 Full sync for SKU: ${sku}`);

    const startTime = Date.now();

    try {
      // Obtener stock actual de Odoo (fuente de verdad)
      const odooStock = await this.odooService.getStockBySku(sku);
      this.logger.log(`📦 Odoo stock: ${odooStock}`);

      // Sincronizar a todos los marketplaces
      const syncResults = await this.syncToAllMarketplaces(sku, odooStock, '');

      const duration = Date.now() - startTime;

      await this.logsService.create({
        service: 'orchestrator',
        action: 'stock_sync_completed',
        status: 'success',
        request: { sku },
        response: { odooStock, syncResults },
        duration,
        productSku: sku,
      });

      this.logger.log(`✅ Full sync completed in ${duration}ms`);
      return { success: true, sku, odooStock, syncResults };
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

      this.logger.error(`❌ Full sync failed: ${error.message}`);
      throw error;
    }
  }
}
