import { Controller, Get, Param, Query } from '@nestjs/common';
import { LogsService } from './logs.service';

@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  async findAll(
    @Query('service') service?: string,
    @Query('action') action?: string,
    @Query('status') status?: string,
    @Query('orderId') orderId?: string,
    @Query('productSku') productSku?: string,
  ) {
    return this.logsService.findAll({
      service,
      action,
      status,
      orderId,
      productSku,
    });
  }

  @Get('order/:orderId')
  async findByOrderId(@Param('orderId') orderId: string) {
    return this.logsService.findByOrderId(orderId);
  }

  @Get('product/:sku')
  async findByProductSku(@Param('sku') sku: string) {
    return this.logsService.findByProductSku(sku);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.logsService.findById(id);
  }
}
