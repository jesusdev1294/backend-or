import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LogsService } from '../logs/logs.service';
import { RipleyOffer, RipleyStockUpdate, RipleyOrder, RipleyApiResponse } from './interfaces/ripley.interface';

@Injectable()
export class RipleyService {
    private readonly logger = new Logger(RipleyService.name);
    private readonly apiClient: AxiosInstance;
    private readonly shopId: string;

    constructor(
        private configService: ConfigService,
        private logsService: LogsService,
    ) {
        const apiUrl = this.configService.get('RIPLEY_API_URL') || 'https://ripley-prod.mirakl.net/api';
        const apiKey = this.configService.get('RIPLEY_API_KEY');
        this.shopId = this.configService.get('RIPLEY_SHOP_ID') || '';

        this.apiClient = axios.create({
            baseURL: apiUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': apiKey,
            },
            timeout: 30000,
        });

        this.logger.log(`RipleyService initialized. API: ${apiUrl}, ShopID: ${this.shopId}`);
    }

    /**
     * Obtener todas las ofertas/productos
     */
    async getOffers(max: number = 100): Promise<RipleyOffer[]> {
        const startTime = Date.now();
        const logData = {
            service: 'ripley',
            action: 'get_offers',
            status: 'pending',
            request: { max },
        };

        try {
            this.logger.log(`Getting offers from Ripley (max: ${max})`);

            const response = await this.apiClient.get<RipleyApiResponse<RipleyOffer[]>>('/offers', {
                params: { max },
            });

            const offers = response.data.offers || [];
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: { count: offers.length },
                duration,
            });

            this.logger.log(`Retrieved ${offers.length} offers from Ripley`);
            return offers;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.logsService.create({
                ...logData,
                status: 'error',
                errorMessage: error.message,
                response: error.response?.data,
                duration,
            });
            this.logger.error(`Error getting offers: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtener oferta por SKU
     */
    async getOfferBySku(sku: string): Promise<RipleyOffer | null> {
        const startTime = Date.now();
        const logData = {
            service: 'ripley',
            action: 'get_offer_by_sku',
            status: 'pending',
            request: { sku },
            productSku: sku,
        };

        try {
            this.logger.log(`Getting offer for SKU: ${sku}`);

            const response = await this.apiClient.get<RipleyApiResponse<RipleyOffer[]>>('/offers', {
                params: { sku, max: 1 },
            });

            const offer = response.data.offers?.[0] || null;
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: offer,
                duration,
            });

            return offer;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.logsService.create({
                ...logData,
                status: 'error',
                errorMessage: error.message,
                duration,
            });
            this.logger.error(`Error getting offer by SKU: ${error.message}`);
            throw error;
        }
    }

    /**
     * Actualizar stock de productos (POST /api/offers)
     */
    async updateStock(products: Array<{ sku: string; quantity: number }>): Promise<any> {
        const startTime = Date.now();
        const logData = {
            service: 'ripley',
            action: 'update_stock',
            status: 'pending',
            request: products,
        };

        try {
            this.logger.log(`Updating stock for ${products.length} products in Ripley`);

            // Construir payload según documentación de Mirakl
            const offers: RipleyStockUpdate[] = products.map((p) => ({
                product_id: p.sku,
                product_id_type: 'SHOP_SKU' as const,
                shop_sku: p.sku,
                quantity: p.quantity,
                state_code: '11', // Estado activo
                update_delete: 'update' as const,
            }));

            const response = await this.apiClient.post('/offers', { offers });

            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: response.data,
                duration,
            });

            this.logger.log(`Stock updated in Ripley. Import ID: ${response.data.import_id}`);
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
            this.logger.error(`Error updating stock in Ripley: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtener órdenes
     */
    async getOrders(startDate?: string): Promise<RipleyOrder[]> {
        const startTime = Date.now();
        const logData = {
            service: 'ripley',
            action: 'get_orders',
            status: 'pending',
            request: { startDate },
        };

        try {
            this.logger.log(`Getting orders from Ripley`);

            const params: any = { max: 100 };
            if (startDate) {
                params.start_date = startDate;
            }

            const response = await this.apiClient.get('/orders', { params });

            const orders = response.data.orders || [];
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
     * Obtener información de la cuenta (para validar credenciales)
     */
    async getAccount(): Promise<any> {
        const startTime = Date.now();

        try {
            this.logger.log('Getting Ripley account info');
            const response = await this.apiClient.get('/account');
            const duration = Date.now() - startTime;

            await this.logsService.create({
                service: 'ripley',
                action: 'get_account',
                status: 'success',
                response: { shop_id: response.data.shop_id },
                duration,
            });

            return response.data;
        } catch (error) {
            await this.logsService.create({
                service: 'ripley',
                action: 'get_account',
                status: 'error',
                errorMessage: error.message,
            });
            this.logger.error(`Error getting account: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtener una orden específica por ID
     */
    async getOrder(orderId: string): Promise<RipleyOrder | null> {
        const startTime = Date.now();
        const logData = {
            service: 'ripley',
            action: 'get_order',
            status: 'pending',
            request: { orderId },
            orderId,
        };

        try {
            this.logger.log(`Getting order ${orderId} from Ripley`);

            const response = await this.apiClient.get(`/orders/${orderId}`);
            const order = response.data || null;
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
            service: 'ripley',
            action: 'get_order_items',
            status: 'pending',
            request: { orderId },
            orderId,
        };

        try {
            this.logger.log(`Getting items for order ${orderId}`);

            const response = await this.apiClient.get(`/orders/${orderId}/lines`);
            const items = response.data.order_lines || response.data.lines || [];
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
        orderLineIds: string[],
        trackingNumber?: string,
        carrierCode?: string,
    ): Promise<any> {
        const startTime = Date.now();
        const logData = {
            service: 'ripley',
            action: 'set_ready_to_ship',
            status: 'pending',
            request: { orderLineIds, trackingNumber, carrierCode },
        };

        try {
            this.logger.log(`Setting ${orderLineIds.length} items to ready to ship`);

            // Mirakl usa endpoint de shipment para actualizar estado
            const shipments = orderLineIds.map((lineId) => ({
                order_line_id: lineId,
                tracking_number: trackingNumber,
                carrier_code: carrierCode,
            }));

            const response = await this.apiClient.post('/shipments', { shipments });
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
            // Mirakl webhooks típicamente usan un secret compartido
            // La validación depende de la configuración específica del shop
            const webhookSecret = this.configService.get('RIPLEY_WEBHOOK_SECRET');

            if (!webhookSecret) {
                this.logger.warn('RIPLEY_WEBHOOK_SECRET not configured, skipping validation');
                return true; // Skip validation if no secret configured
            }

            const crypto = await import('crypto');
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(JSON.stringify(payload))
                .digest('hex');

            const isValid = signature === expectedSignature;

            await this.logsService.create({
                service: 'ripley',
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

