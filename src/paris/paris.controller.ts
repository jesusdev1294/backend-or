import {
    Controller,
    Post,
    Get,
    Put,
    Body,
    Headers,
    HttpException,
    HttpStatus,
    Logger,
    Param,
    Query,
} from '@nestjs/common';
import { ParisService } from './paris.service';
import { LogsService } from '../logs/logs.service';
import { OdooService } from '../odoo/odoo.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Controller('paris')
export class ParisController {
    private readonly logger = new Logger(ParisController.name);

    constructor(
        private readonly parisService: ParisService,
        private readonly odooService: OdooService,
        private readonly logsService: LogsService,
        @InjectQueue('stock-updates') private stockQueue: Queue,
    ) { }

    /**
     * Webhook para recibir órdenes de Paris
     */
    @Post('webhook/order')
    async handleOrderWebhook(
        @Body() body: any,
        @Headers('x-paris-signature') signature: string,
    ) {
        const orderId = body.orderId || body.order_id || body.id;

        this.logger.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        this.logger.log(`📥 Paris Webhook: Order ${orderId}`);
        this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        await this.logsService.create({
            service: 'paris',
            action: 'webhook_received',
            status: 'success',
            request: body,
            orderId,
            metadata: { signature },
        });

        try {
            // Extraer información de la orden
            const orderItems = body.items || body.orderItems || [];
            const customer = body.customer || {};
            const shipping = body.shipping || {};

            const items = orderItems.map((item: any) => ({
                sku: item.sku,
                quantity: item.quantity || 1,
                price: item.price || item.totalPrice || 0,
                name: item.name || item.productName || '',
            }));

            // Procesar orden completa en Odoo
            const result = await this.odooService.processMarketplaceOrder({
                marketplace: 'paris',
                orderId: orderId,
                customer: {
                    name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Cliente Paris',
                    email: customer.email || `paris-${orderId}@temp.cl`,
                    phone: customer.phone,
                    nationalId: customer.rut,
                    legalId: customer.billingAddress?.rut || customer.legalId,
                    billingName: customer.billingAddress?.company || customer.billingName,
                    billingStreet: customer.billingAddress?.street,
                    billingCity: customer.billingAddress?.city,
                },
                items,
                shippingPrice: shipping.price || body.totals?.shipping || 0,
            });

            // Agregar job para sincronizar stock a otros marketplaces
            for (const item of items) {
                const stockUpdate = result.stockUpdates.find((s: any) => s.sku === item.sku);
                if (stockUpdate) {
                    await this.stockQueue.add('reduce-stock', {
                        orderId,
                        sku: item.sku,
                        quantity: item.quantity,
                        source: 'paris',
                        newStock: stockUpdate.newStock,
                    });
                }
            }

            this.logger.log(`✅ Orden ${orderId} procesada exitosamente`);

            return {
                success: true,
                message: 'Order processed successfully',
                orderId,
                saleOrderId: result.saleOrderId,
                itemsProcessed: items.length,
            };
        } catch (error) {
            this.logger.error(`❌ Error processing webhook: ${error.message}`);

            await this.logsService.create({
                service: 'paris',
                action: 'webhook_processing_error',
                status: 'error',
                request: body,
                errorMessage: error.message,
                orderId,
            });

            throw new HttpException(
                `Failed to process webhook: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Obtener stock de Paris (v2 - usa JWT)
     */
    @Get('stock')
    async getStock(
        @Query('limit') limit: number = 100,
        @Query('offset') offset: number = 0,
    ) {
        try {
            const skus = await this.parisService.getStock(Number(limit), Number(offset));
            return {
                success: true,
                count: skus.length,
                data: skus,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to get stock',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Obtener stock de un SKU específico
     */
    @Get('stock/:sku')
    async getStockBySku(@Param('sku') sku: string) {
        try {
            const skus = await this.parisService.getStock(1000, 0);
            const skuData = skus.find((s: any) => s.sku_seller === sku || s.sku === sku);
            if (!skuData) {
                throw new HttpException('SKU not found', HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                data: skuData,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                error.message || 'Failed to get stock',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Actualizar stock en Paris
     */
    @Put('stock')
    async updateStock(
        @Body() body: { products: Array<{ sku: string; quantity: number }> },
    ) {
        try {
            const result = await this.parisService.updateStock(body.products);
            return {
                success: true,
                message: 'Stock updated successfully',
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
     * Endpoint alternativo POST para actualizar stock
     */
    @Post('stock/update')
    async updateStockPost(
        @Body() body: { products: Array<{ sku: string; quantity: number }> },
    ) {
        return this.updateStock(body);
    }

    /**
     * Obtener órdenes de Paris
     */
    @Get('orders')
    async getOrders(
        @Query('start_date') startDate?: string,
        @Query('status') status?: string,
    ) {
        try {
            const orders = await this.parisService.getOrders(startDate, status);
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
     * Health check
     */
    @Get('health')
    async healthCheck() {
        const result = await this.parisService.healthCheck();
        if (!result.connected) {
            throw new HttpException(
                { success: false, message: result.message },
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
        return {
            success: true,
            message: result.message,
        };
    }
}
