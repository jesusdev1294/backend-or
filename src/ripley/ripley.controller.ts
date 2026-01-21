import {
    Controller,
    Post,
    Get,
    Body,
    Headers,
    HttpException,
    HttpStatus,
    Logger,
    Param,
    Query,
} from '@nestjs/common';
import { RipleyService } from './ripley.service';
import { LogsService } from '../logs/logs.service';
import { OdooService } from '../odoo/odoo.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Controller('ripley')
export class RipleyController {
    private readonly logger = new Logger(RipleyController.name);

    constructor(
        private readonly ripleyService: RipleyService,
        private readonly odooService: OdooService,
        private readonly logsService: LogsService,
        @InjectQueue('stock-updates') private stockQueue: Queue,
    ) { }

    /**
     * Webhook para recibir órdenes de Ripley
     */
    @Post('webhook/order')
    async handleOrderWebhook(
        @Body() body: any,
        @Headers('x-mirakl-signature') signature: string,
    ) {
        const orderId = body.order_id || body.orderId || body.id;

        this.logger.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        this.logger.log(`📥 Ripley Webhook: Order ${orderId}`);
        this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        await this.logsService.create({
            service: 'ripley',
            action: 'webhook_received',
            status: 'success',
            request: body,
            orderId,
            metadata: { signature },
        });

        try {
            // Extraer información de la orden
            const orderLines = body.order_lines || body.items || [];
            const customer = body.customer || {};
            const shipping = body.shipping || {};

            const items = orderLines.map((line: any) => ({
                sku: line.offer_sku || line.sku,
                quantity: line.quantity || 1,
                price: line.price || 0,
                name: line.product_title || line.name || '',
            }));

            // Procesar orden completa en Odoo
            const result = await this.odooService.processMarketplaceOrder({
                marketplace: 'ripley',
                orderId: orderId,
                customer: {
                    name: `${customer.firstname || ''} ${customer.lastname || ''}`.trim() || 'Cliente Ripley',
                    email: customer.email || `ripley-${orderId}@temp.cl`,
                    phone: customer.billing_address?.phone,
                    nationalId: customer.vat || customer.rut,
                    legalId: customer.billing_address?.vat,
                    billingName: customer.billing_address?.company,
                    billingStreet: customer.billing_address?.street_1,
                    billingCity: customer.billing_address?.city,
                },
                items,
                shippingPrice: shipping.price || 0,
            });

            // Agregar job para sincronizar stock a otros marketplaces
            for (const item of items) {
                const stockUpdate = result.stockUpdates.find((s: any) => s.sku === item.sku);
                if (stockUpdate) {
                    await this.stockQueue.add('reduce-stock', {
                        orderId,
                        sku: item.sku,
                        quantity: item.quantity,
                        source: 'ripley',
                        newStock: stockUpdate.newStock, // Ya reducido, solo sincronizar
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
                service: 'ripley',
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
     * Obtener productos/ofertas de Ripley
     */
    @Get('products')
    async getProducts(@Query('max') max: number = 100) {
        try {
            const offers = await this.ripleyService.getOffers(Number(max));
            return {
                success: true,
                count: offers.length,
                data: offers,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to get products',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Obtener producto por SKU
     */
    @Get('products/:sku')
    async getProductBySku(@Param('sku') sku: string) {
        try {
            const offer = await this.ripleyService.getOfferBySku(sku);
            if (!offer) {
                throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                data: offer,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                error.message || 'Failed to get product',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Actualizar stock en Ripley
     */
    @Post('stock/update')
    async updateStock(
        @Body() body: { products: Array<{ sku: string; quantity: number }> },
    ) {
        try {
            const result = await this.ripleyService.updateStock(body.products);
            return {
                success: true,
                message: 'Stock update submitted',
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
     * Obtener órdenes de Ripley
     */
    @Get('orders')
    async getOrders(@Query('start_date') startDate?: string) {
        try {
            const orders = await this.ripleyService.getOrders(startDate);
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
     * Validar conexión con Ripley (health check)
     */
    @Get('health')
    async healthCheck() {
        try {
            const account = await this.ripleyService.getAccount();
            return {
                success: true,
                message: 'Connected to Ripley',
                shopId: account.shop_id,
            };
        } catch (error) {
            throw new HttpException(
                { success: false, message: error.message },
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }
}
