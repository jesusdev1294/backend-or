import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LogsService } from '../logs/logs.service';
import { ParisProduct, ParisStockUpdate, ParisOrder, ParisApiResponse } from './interfaces/paris.interface';

@Injectable()
export class ParisService {
    private readonly logger = new Logger(ParisService.name);
    private readonly apiClient: AxiosInstance;
    private readonly sellerId: string;

    constructor(
        private configService: ConfigService,
        private logsService: LogsService,
    ) {
        const apiUrl = this.configService.get('PARIS_API_URL') || 'https://api-developers.ecomm.cencosud.com';
        const apiKey = this.configService.get('PARIS_API_KEY');
        this.sellerId = this.configService.get('PARIS_SELLER_ID') || '';

        this.apiClient = axios.create({
            baseURL: apiUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Bearer token auth
            },
            timeout: 30000,
        });

        this.logger.log(`ParisService initialized. API: ${apiUrl}, SellerId: ${this.sellerId}`);
    }

    /**
     * Obtener todos los productos
     */
    async getProducts(limit: number = 100, page: number = 1): Promise<ParisProduct[]> {
        const startTime = Date.now();
        const logData = {
            service: 'paris',
            action: 'get_products',
            status: 'pending',
            request: { limit, page },
        };

        try {
            this.logger.log(`Getting products from Paris (limit: ${limit}, page: ${page})`);

            const response = await this.apiClient.get<ParisApiResponse<ParisProduct[]>>('/v1/products', {
                params: { limit, page, sellerId: this.sellerId },
            });

            const products = response.data.products || response.data.data || [];
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: { count: products.length },
                duration,
            });

            this.logger.log(`Retrieved ${products.length} products from Paris`);
            return products;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.logsService.create({
                ...logData,
                status: 'error',
                errorMessage: error.message,
                response: error.response?.data,
                duration,
            });
            this.logger.error(`Error getting products: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtener producto por SKU
     */
    async getProductBySku(sku: string): Promise<ParisProduct | null> {
        const startTime = Date.now();
        const logData = {
            service: 'paris',
            action: 'get_product_by_sku',
            status: 'pending',
            request: { sku },
            productSku: sku,
        };

        try {
            this.logger.log(`Getting product for SKU: ${sku}`);

            const response = await this.apiClient.get<ParisApiResponse<ParisProduct>>(`/v1/products/${sku}`, {
                params: { sellerId: this.sellerId },
            });

            const product: ParisProduct | null = (response.data.data as ParisProduct) || null;
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: product,
                duration,
            });

            return product;
        } catch (error) {
            const duration = Date.now() - startTime;

            // 404 means product not found, not an error
            if (error.response?.status === 404) {
                await this.logsService.create({
                    ...logData,
                    status: 'success',
                    response: null,
                    duration,
                });
                return null;
            }

            await this.logsService.create({
                ...logData,
                status: 'error',
                errorMessage: error.message,
                duration,
            });
            this.logger.error(`Error getting product by SKU: ${error.message}`);
            throw error;
        }
    }

    /**
     * Actualizar stock de productos (PUT /v1/stock)
     */
    async updateStock(products: Array<{ sku: string; quantity: number }>): Promise<any> {
        const startTime = Date.now();
        const logData = {
            service: 'paris',
            action: 'update_stock',
            status: 'pending',
            request: products,
        };

        try {
            this.logger.log(`Updating stock for ${products.length} products in Paris`);

            // Construir payload según documentación de Cencosud
            const stockUpdates = products.map((p) => ({
                sku: p.sku,
                quantity: p.quantity,
                sellerId: this.sellerId,
            }));

            const response = await this.apiClient.put('/v1/stock', {
                stocks: stockUpdates,
            });

            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: response.data,
                duration,
            });

            this.logger.log(`Stock updated in Paris successfully`);
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
            this.logger.error(`Error updating stock in Paris: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtener órdenes
     */
    async getOrders(startDate?: string, status?: string): Promise<ParisOrder[]> {
        const startTime = Date.now();
        const logData = {
            service: 'paris',
            action: 'get_orders',
            status: 'pending',
            request: { startDate, status },
        };

        try {
            this.logger.log(`Getting orders from Paris`);

            const params: any = { sellerId: this.sellerId, limit: 100 };
            if (startDate) params.startDate = startDate;
            if (status) params.status = status;

            const response = await this.apiClient.get<ParisApiResponse<ParisOrder[]>>('/v1/orders', { params });

            const orders = response.data.orders || response.data.data || [];
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: { count: orders.length },
                duration,
            });

            return orders;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.logsService.create({
                ...logData,
                status: 'error',
                errorMessage: error.message,
                duration,
            });
            this.logger.error(`Error getting orders: ${error.message}`);
            throw error;
        }
    }

    /**
     * Health check - verificar conexión
     */
    async healthCheck(): Promise<{ connected: boolean; message: string }> {
        const startTime = Date.now();

        try {
            this.logger.log('Checking Paris API connection');

            // Try to get products with limit 1 as health check
            await this.apiClient.get('/v1/products', {
                params: { limit: 1, sellerId: this.sellerId },
            });

            const duration = Date.now() - startTime;

            await this.logsService.create({
                service: 'paris',
                action: 'health_check',
                status: 'success',
                response: { connected: true },
                duration,
            });

            return { connected: true, message: 'Connected to Paris API' };
        } catch (error) {
            await this.logsService.create({
                service: 'paris',
                action: 'health_check',
                status: 'error',
                errorMessage: error.message,
            });
            return { connected: false, message: error.message };
        }
    }

    /**
     * Obtener una orden específica por ID
     */
    async getOrder(orderId: string): Promise<ParisOrder | null> {
        const startTime = Date.now();
        const logData = {
            service: 'paris',
            action: 'get_order',
            status: 'pending',
            request: { orderId },
            orderId,
        };

        try {
            this.logger.log(`Getting order ${orderId} from Paris`);

            const response = await this.apiClient.get(`/v1/orders/${orderId}`, {
                params: { sellerId: this.sellerId },
            });
            const order = response.data.data || response.data || null;
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: order,
                duration,
            });

            return order;
        } catch (error) {
            const duration = Date.now() - startTime;

            if (error.response?.status === 404) {
                await this.logsService.create({
                    ...logData,
                    status: 'success',
                    response: null,
                    duration,
                });
                return null;
            }

            await this.logsService.create({
                ...logData,
                status: 'error',
                errorMessage: error.message,
                duration,
            });
            this.logger.error(`Error getting order: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtener los items de una orden específica
     */
    async getOrderItems(orderId: string): Promise<any[]> {
        const startTime = Date.now();
        const logData = {
            service: 'paris',
            action: 'get_order_items',
            status: 'pending',
            request: { orderId },
            orderId,
        };

        try {
            this.logger.log(`Getting items for order ${orderId}`);

            const response = await this.apiClient.get(`/v1/orders/${orderId}/items`, {
                params: { sellerId: this.sellerId },
            });
            const items = response.data.items || response.data.data || [];
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: { count: items.length },
                duration,
            });

            return items;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.logsService.create({
                ...logData,
                status: 'error',
                errorMessage: error.message,
                duration,
            });
            this.logger.error(`Error getting order items: ${error.message}`);
            throw error;
        }
    }

    /**
     * Marcar items de orden como "Lista para enviar"
     */
    async setStatusToReadyToShip(
        orderItemIds: string[],
        trackingNumber?: string,
        carrierName?: string,
    ): Promise<any> {
        const startTime = Date.now();
        const logData = {
            service: 'paris',
            action: 'set_ready_to_ship',
            status: 'pending',
            request: { orderItemIds, trackingNumber, carrierName },
        };

        try {
            this.logger.log(`Setting ${orderItemIds.length} items to ready to ship`);

            const shipmentData = {
                sellerId: this.sellerId,
                items: orderItemIds.map((itemId) => ({
                    itemId,
                    trackingNumber,
                    carrierName,
                    status: 'ready_to_ship',
                })),
            };

            const response = await this.apiClient.put('/v1/shipments', shipmentData);
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: response.data,
                duration,
            });

            this.logger.log(`Items marked as ready to ship`);
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
            this.logger.error(`Error setting ready to ship: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validar firma del webhook
     */
    async validateWebhookSignature(payload: any, signature: string): Promise<boolean> {
        try {
            const webhookSecret = this.configService.get('PARIS_WEBHOOK_SECRET');

            if (!webhookSecret) {
                this.logger.warn('PARIS_WEBHOOK_SECRET not configured, skipping validation');
                return true; // Skip validation if no secret configured
            }

            const crypto = await import('crypto');
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(JSON.stringify(payload))
                .digest('hex');

            const isValid = signature === expectedSignature;

            await this.logsService.create({
                service: 'paris',
                action: 'validate_webhook_signature',
                status: isValid ? 'success' : 'error',
                request: { signatureProvided: !!signature },
                response: { isValid },
            });

            return isValid;
        } catch (error) {
            this.logger.error(`Error validating webhook signature: ${error.message}`);
            return false;
        }
    }
}

