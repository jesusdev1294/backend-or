import { Controller, Post, Body, Get, Param, Logger } from '@nestjs/common';
import { OdooService } from './odoo.service';
import { LogsService } from '../logs/logs.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Controller('odoo')
export class OdooController {
  private readonly logger = new Logger(OdooController.name);

  constructor(
    private readonly odooService: OdooService,
    private readonly logsService: LogsService,
    @InjectQueue('stock-updates') private stockQueue: Queue,
  ) {}

  @Post('webhook/stock-change')
  async handleStockChange(@Body() payload: any) {
    this.logger.log('Received stock change webhook from Odoo');

    await this.logsService.create({
      service: 'odoo',
      action: 'webhook_received',
      status: 'success',
      request: payload,
    });

    const { sku, quantity, action } = payload;

    // Si Odoo notifica cambio de stock, actualizar en Falabella
    if (action === 'stock_updated') {
      await this.stockQueue.add('update-marketplace', {
        sku,
        quantity,
        marketplace: 'falabella',
        source: 'odoo',
      });

      this.logger.log(
        `Added to queue: update Falabella stock for SKU ${sku}`,
      );
    }

    return {
      success: true,
      message: 'Webhook received and queued',
    };
  }

  @Get('stock/:sku')
  async getStock(@Param('sku') sku: string) {
    const stock = await this.odooService.getStockBySku(sku);
    return {
      sku,
      stock,
      source: 'odoo',
    };
  }

  @Post('stock/reduce')
  async reduceStock(
    @Body() payload: { sku: string; quantity: number; orderId?: string },
  ) {
    const result = await this.odooService.reduceStock(
      payload.sku,
      payload.quantity,
      payload.orderId,
    );

    return {
      success: true,
      message: 'Stock reduced successfully',
      result,
    };
  }

  @Post('stock/increase')
  async increaseStock(
    @Body() payload: { sku: string; quantity: number },
  ) {
    const result = await this.odooService.increaseStock(
      payload.sku,
      payload.quantity,
    );

    return {
      success: true,
      message: 'Stock increased successfully',
      result,
    };
  }
}
