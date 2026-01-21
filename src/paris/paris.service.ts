import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LogsService } from '../logs/logs.service';
import { ParisProduct, ParisOrder, ParisApiResponse } from './interfaces/paris.interface';

@Injectable()
export class ParisService {
    private readonly logger = new Logger(ParisService.name);
    private readonly apiUrl: string;
    private readonly apiKey: string;
    private readonly sellerId: string;

    // JWT token cache
    private jwtToken: string | null = null;
    private jwtExpiresAt: number = 0;

    constructor(
        private configService: ConfigService,
        private logsService: LogsService,
    ) {
        this.apiUrl = this.configService.get('PARIS_API_URL') || 'https://api-developers.ecomm.cencosud.com';
        this.apiKey = this.configService.get('PARIS_API_KEY') || '';
        this.sellerId = this.configService.get('PARIS_SELLER_ID') || '';

        this.logger.log(`ParisService initialized. API: ${this.apiUrl}, SellerId: ${this.sellerId}`);
    }

    /**
     * Obtiene un JWT token para operaciones que lo requieren (stock, productos v2)
     * El token se cachea por 4 horas (14400 segundos)
     */
    private async getJwtToken(): Promise<string> {
        // Check if we have a valid cached token (with 5 min buffer)
        const now = Date.now();
        if (this.jwtToken && this.jwtExpiresAt > now + 300000) {
            return this.jwtToken;
        }

        this.logger.log('Obtaining new JWT token from Paris...');

        try {
            const response = await axios.post(
                `${this.apiUrl}/v1/auth/apiKey`,
                {},
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`,
                    },
                }
            );

            this.jwtToken = response.data.accessToken;
            // Token expires in 14400 seconds (4 hours)
            const expiresIn = parseInt(response.data.expiresIn) || 14400;
            this.jwtExpiresAt = now + (expiresIn * 1000);

            this.logger.log(`JWT token obtained, expires in ${expiresIn} seconds`);

            await this.logsService.create({
                service: 'paris',
                action: 'get_jwt_token',
                status: 'success',
                response: { expiresIn },
            });

            return this.jwtToken;
        } catch (error) {
            this.logger.error(`Error getting JWT token: ${error.message}`);
            await this.logsService.create({
                service: 'paris',
                action: 'get_jwt_token',
                status: 'error',
                errorMessage: error.message,
            });
            throw error;
        }
    }

    /**
     * Crea un cliente axios con el token apropiado
     * - JWT para endpoints de stock y productos v2
     * - API Key simple para orders v1
     */
    private async getApiClient(useJwt: boolean = false): Promise<AxiosInstance> {
        let authHeader: string;

        if (useJwt) {
            const jwt = await this.getJwtToken();
            authHeader = `Bearer ${jwt}`;
        } else {
            authHeader = `Bearer ${this.apiKey}`;
        }

        return axios.create({
            baseURL: this.apiUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': authHeader,
            },
            timeout: 30000,
        });
    }

    /**
     * Obtener stock de productos (v2 - requiere JWT)
     */
    async getStock(limit: number = 100, offset: number = 0): Promise<any[]> {
        const startTime = Date.now();
        const logData = {
            service: 'paris',
            action: 'get_stock',
            status: 'pending',
            request: { limit, offset },
        };

        try {
            this.logger.log(`Getting stock from Paris (limit: ${limit}, offset: ${offset})`);

            const client = await this.getApiClient(true); // Use JWT
            const response = await client.get('/v2/stock', {
                params: { limit, offset },
            });

            const skus = response.data.skus || [];
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: { count: skus.length, total: response.data.pagging?.quantity },
                duration,
            });

            this.logger.log(`Retrieved ${skus.length} SKUs from Paris (total: ${response.data.pagging?.quantity})`);
            return skus;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.logsService.create({
                ...logData,
                status: 'error',
                errorMessage: error.message,
                response: error.response?.data,
                duration,
            });
            this.logger.error(`Error getting stock: ${error.message}`);
            throw error;
        }
    }

    /**
     * Actualizar stock de productos (v1 - requiere JWT)
     * Endpoint: POST /v1/stock/sku-seller
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

            const client = await this.getApiClient(true); // Use JWT

            // Formato según documentación de Paris
            const body = {
                skus: products.map((p) => ({
                    sku_seller: p.sku,
                    quantity: p.quantity,
                })),
            };

            const response = await client.post('/v1/stock/sku-seller', body);

            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: response.data,
                duration,
            });

            this.logger.log(`Stock updated in Paris: ${response.data.skusUpdated?.length || 0} SKUs updated`);
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
     * Obtener órdenes (v1 - usa API Key simple)
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

            const client = await this.getApiClient(false); // Use API Key
            const params: any = { sellerId: this.sellerId, limit: 100 };
            if (startDate) params.startDate = startDate;
            if (status) params.status = status;

            const response = await client.get<ParisApiResponse<ParisOrder[]>>('/v1/orders', { params });

            const orders = response.data.data || [];
            const duration = Date.now() - startTime;

            await this.logsService.create({
                ...logData,
                status: 'success',
                response: { count: orders.length },
                duration,
            });

            this.logger.log(`Retrieved ${orders.length} orders from Paris`);
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
     * Health check - verificar conexión usando órdenes (no requiere JWT)
     */
    async healthCheck(): Promise<{ connected: boolean; message: string }> {
        const startTime = Date.now();

        try {
            this.logger.log('Checking Paris API connection');

            const client = await this.getApiClient(false);
            await client.get('/v1/orders', {
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

            const client = await this.getApiClient(false);
            const response = await client.get(`/v1/orders/${orderId}`, {
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

            const client = await this.getApiClient(false);
            const response = await client.get(`/v1/orders/${orderId}/items`, {
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

            const client = await this.getApiClient(false);
            const shipmentData = {
                sellerId: this.sellerId,
                items: orderItemIds.map((itemId) => ({
                    itemId,
                    trackingNumber,
                    carrierName,
                    status: 'ready_to_ship',
                })),
            };

            const response = await client.put('/v1/shipments', shipmentData);
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
                return true;
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
