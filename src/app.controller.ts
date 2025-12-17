import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getStatus() {
    return {
      status: 'running',
      service: 'Orquestador Marketplace',
      version: '1.0.0',
      endpoints: {
        logs: '/logs',
        falabella: {
          webhook: '/falabella/webhook/order',
        },
        odoo: {
          webhook: '/odoo/webhook/stock-change',
          getStock: '/odoo/stock/:sku',
          reduceStock: '/odoo/stock/reduce',
          increaseStock: '/odoo/stock/increase',
        },
      },
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
  
  @Get('test')
  getTest() {
    return {
      message: 'Test OK',
      timestamp: new Date().toISOString(),
    };
  }
}
