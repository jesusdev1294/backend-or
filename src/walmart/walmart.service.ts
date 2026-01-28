import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LogsService } from '../logs/logs.service';
import {
    WalmartInventory,
    WalmartOrder,
    WalmartTokenResponse,
    WalmartApiResponse
} from './interfaces/walmart.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WalmartService {
    private readonly logger = new Logger(WalmartService.name);
    private readonly apiUrl: string;
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly sellerId: string;

    // Token OAuth 2.0 (expira en 15 min, cacheamos por 14 min)
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;

    constructor(
        private configService: ConfigService,
        private logsService: LogsService,
    ) {
        this.apiUrl = this.configService.get<string>('WMT_CL_API_BASE') || 'https://marketplace.walmartapis.com/v3';
        this.clientId = this.configService.get<string>('WMT_CL_CLIENT_ID') || '';
        this.clientSecret = this.configService.get<string>('WMT_CL_CLIENT_SECRET') || '';
        this.sellerId = this.configService.get<string>('WMT_CL_SELLER_ID') || '';

        this.logger.log(`Walmart Service initialized - Seller ID: ${this.sellerId}`);
    }

    /**
     * Obtiene un token OAuth 2.0 (caché por 14 minutos para evitar expiración)
     */
    private async getToken(): Promise<string> {
        const now = Date.now();

        if (this.accessToken && this.tokenExpiresAt > now + 60000) {
            return this.accessToken;
        }

        this.logger.log('Obteniendo nuevo token OAuth de Walmart...');

        try {
            const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

            const response = await axios.post<WalmartTokenResponse>(
                `${this.apiUrl}/token`,
                'grant_type=client_credentials',
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json',
                        'WM_MARKET': 'cl',
                        'WM_SVC.NAME': 'HyperPC Orquestador',
                        'WM_QOS.CORRELATION_ID': uuidv4(),
                    },
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiresAt = now + ((response.data.expires_in - 60) * 1000);

            this.logger.log(`Token OAuth obtenido, expira en ${response.data.expires_in} segundos`);

            return this.accessToken;
        } catch (error) {
            this.logger.error('Error obteniendo token OAuth de Walmart:', error.response?.data || error.message);
            throw new Error(`Failed to get Walmart OAuth token: ${error.message}`);
        }
    }

    /**
     * Crea un cliente Axios con los headers obligatorios de Walmart
     */
    private async getApiClient(): Promise<AxiosInstance> {
        const token = await this.getToken();

        return axios.create({
            baseURL: this.apiUrl,
            headers: {
                'WM_SEC.ACCESS_TOKEN': token,  // Walmart Chile usa este header, no Authorization: Bearer
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'WM_MARKET': 'cl',
                'WM_SVC.NAME': 'HyperPC Orquestador',
                'WM_QOS.CORRELATION_ID': uuidv4(),
            },
        });
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<{ connected: boolean; message: string }> {
        try {
            await this.getToken();
            return { connected: true, message: 'Connected to Walmart API' };
        } catch (error) {
            return { connected: false, message: error.message };
        }
    }

    /**
     * Obtener inventario de un SKU específico
     */
    async getInventory(sku: string): Promise<WalmartInventory | null> {
        try {
            const client = await this.getApiClient();
            const response = await client.get('/inventory', { params: { sku } });

            await this.logsService.create({
                service: 'walmart',
                action: 'GET_INVENTORY',
                status: 'success',
                request: { sku },
                response: response.data,
            });

            return response.data;
        } catch (error) {
            this.logger.error(`Error getting inventory for SKU ${sku}:`, error.response?.data || error.message);

            await this.logsService.create({
                service: 'walmart',
                action: 'GET_INVENTORY_ERROR',
                status: 'error',
                request: { sku },
                errorMessage: error.response?.data?.message || error.message,
            });

            if (error.response?.status === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Actualizar stock de productos
     */
    async updateStock(products: Array<{ sku: string; quantity: number }>): Promise<any> {
        try {
            const client = await this.getApiClient();
            const results = [];

            for (const product of products) {
                this.logger.log(`Updating Walmart stock: ${product.sku} → ${product.quantity}`);

                const payload = {
                    sku: product.sku,
                    quantity: {
                        unit: 'EACH',
                        amount: product.quantity,
                    },
                };

                try {
                    const response = await client.put('/inventory', payload, {
                        params: { sku: product.sku },
                    });

                    results.push({
                        sku: product.sku,
                        success: true,
                        data: response.data,
                    });

                    await this.logsService.create({
                        service: 'walmart',
                        action: 'UPDATE_STOCK',
                        status: 'success',
                        request: { sku: product.sku, quantity: product.quantity },
                        response: response.data,
                    });
                } catch (itemError) {
                    results.push({
                        sku: product.sku,
                        success: false,
                        error: itemError.response?.data || itemError.message,
                    });

                    this.logger.error(`Error updating stock for ${product.sku}:`, itemError.response?.data);
                }
            }

            return {
                updated: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                results,
            };
        } catch (error) {
            this.logger.error('Error updating Walmart stock:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Obtener órdenes
     */
    async getOrders(startDate?: string, status?: string): Promise<WalmartOrder[]> {
        try {
            const client = await this.getApiClient();

            const defaultStartDate = new Date();
            defaultStartDate.setDate(defaultStartDate.getDate() - 7);

            const params: any = {
                createdStartDate: startDate || defaultStartDate.toISOString(),
                limit: 100,
            };

            if (status) {
                params.status = status;
            }

            const response = await client.get<WalmartApiResponse<{ order: WalmartOrder[] }>>('/orders', { params });

            await this.logsService.create({
                service: 'walmart',
                action: 'GET_ORDERS',
                status: 'success',
                request: params,
                response: { count: response.data.list?.elements?.order?.length || 0 },
            });

            return response.data.list?.elements?.order || [];
        } catch (error) {
            this.logger.error('Error getting Walmart orders:', error.response?.data || error.message);

            await this.logsService.create({
                service: 'walmart',
                action: 'GET_ORDERS_ERROR',
                status: 'error',
                request: { startDate, status },
                errorMessage: error.response?.data?.message || error.message,
            });

            throw error;
        }
    }

    /**
     * Obtener una orden específica
     */
    async getOrder(orderId: string): Promise<WalmartOrder | null> {
        try {
            const client = await this.getApiClient();
            const response = await client.get(`/orders/${orderId}`);
            return response.data.order || response.data;
        } catch (error) {
            this.logger.error(`Error getting order ${orderId}:`, error.response?.data || error.message);
            if (error.response?.status === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Acknowledge una orden
     */
    async acknowledgeOrder(orderId: string): Promise<any> {
        try {
            const client = await this.getApiClient();
            const response = await client.post(`/orders/${orderId}/acknowledge`);

            await this.logsService.create({
                service: 'walmart',
                action: 'ACKNOWLEDGE_ORDER',
                status: 'success',
                request: { orderId },
                response: response.data,
            });

            return response.data;
        } catch (error) {
            this.logger.error(`Error acknowledging order ${orderId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Marcar orden como enviada
     */
    async shipOrder(
        orderId: string,
        lineNumber: string,
        trackingNumber: string,
        carrier: string,
        methodCode: string = 'Standard',
    ): Promise<any> {
        try {
            const client = await this.getApiClient();

            const payload = {
                orderShipment: {
                    orderLines: {
                        orderLine: [{
                            lineNumber,
                            orderLineStatuses: {
                                orderLineStatus: [{
                                    status: 'Shipped',
                                    statusQuantity: {
                                        unitOfMeasurement: 'EACH',
                                        amount: '1',
                                    },
                                    trackingInfo: {
                                        shipDateTime: new Date().toISOString(),
                                        carrierName: { carrier },
                                        methodCode,
                                        trackingNumber,
                                    },
                                }],
                            },
                        }],
                    },
                },
            };

            const response = await client.post(`/orders/${orderId}/shipping`, payload);

            await this.logsService.create({
                service: 'walmart',
                action: 'SHIP_ORDER',
                status: 'success',
                request: { orderId, lineNumber, trackingNumber, carrier },
                response: response.data,
            });

            return response.data;
        } catch (error) {
            this.logger.error(`Error shipping order ${orderId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Validar firma del webhook (Walmart no tiene webhooks)
     */
    async validateWebhookSignature(payload: any, signature: string): Promise<boolean> {
        this.logger.warn('Walmart does not support webhooks');
        return false;
    }
}
