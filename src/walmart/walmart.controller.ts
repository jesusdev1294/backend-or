import {
    Controller,
    Post,
    Get,
    Put,
    Body,
    HttpException,
    HttpStatus,
    Logger,
    Param,
    Query,
} from '@nestjs/common';
import { WalmartService } from './walmart.service';
import { LogsService } from '../logs/logs.service';

@Controller('walmart')
export class WalmartController {
    private readonly logger = new Logger(WalmartController.name);

    constructor(
        private readonly walmartService: WalmartService,
        private readonly logsService: LogsService,
    ) { }

    /**
     * Health check - verificar conexión con Walmart API
     */
    @Get('health')
    async healthCheck() {
        try {
            const result = await this.walmartService.healthCheck();
            return {
                success: result.connected,
                message: result.message,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to connect to Walmart API',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }

    /**
     * Obtener inventario de un SKU
     */
    @Get('inventory')
    async getInventory(@Query('sku') sku: string) {
        if (!sku) {
            throw new HttpException(
                'SKU parameter is required',
                HttpStatus.BAD_REQUEST,
            );
        }

        try {
            const inventory = await this.walmartService.getInventory(sku);
            return {
                success: true,
                data: inventory,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to get inventory',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Actualizar stock de productos
     * Body: { products: [{ sku: string, quantity: number }] }
     */
    @Put('stock')
    async updateStock(@Body() body: { products: Array<{ sku: string; quantity: number }> }) {
        if (!body.products || !Array.isArray(body.products)) {
            throw new HttpException(
                'Products array is required',
                HttpStatus.BAD_REQUEST,
            );
        }

        try {
            const result = await this.walmartService.updateStock(body.products);
            return {
                success: true,
                message: 'Stock updated',
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
     * Obtener órdenes
     */
    @Get('orders')
    async getOrders(
        @Query('startDate') startDate?: string,
        @Query('status') status?: string,
    ) {
        try {
            const orders = await this.walmartService.getOrders(startDate, status);
            return {
                success: true,
                count: orders.length,
                data: orders,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to get orders',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Obtener una orden específica
     */
    @Get('orders/:orderId')
    async getOrder(@Param('orderId') orderId: string) {
        try {
            const order = await this.walmartService.getOrder(orderId);
            if (!order) {
                throw new HttpException(
                    `Order ${orderId} not found`,
                    HttpStatus.NOT_FOUND,
                );
            }
            return {
                success: true,
                data: order,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                error.message || 'Failed to get order',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Acknowledge una orden
     */
    @Post('orders/:orderId/acknowledge')
    async acknowledgeOrder(@Param('orderId') orderId: string) {
        try {
            const result = await this.walmartService.acknowledgeOrder(orderId);
            return {
                success: true,
                data: result,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to acknowledge order',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Marcar orden como enviada
     */
    @Post('orders/:orderId/ship')
    async shipOrder(
        @Param('orderId') orderId: string,
        @Body() body: {
            lineNumber: string;
            trackingNumber: string;
            carrier: string;
            methodCode?: string;
        },
    ) {
        if (!body.lineNumber || !body.trackingNumber || !body.carrier) {
            throw new HttpException(
                'lineNumber, trackingNumber, and carrier are required',
                HttpStatus.BAD_REQUEST,
            );
        }

        try {
            const result = await this.walmartService.shipOrder(
                orderId,
                body.lineNumber,
                body.trackingNumber,
                body.carrier,
                body.methodCode,
            );
            return {
                success: true,
                data: result,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to ship order',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
