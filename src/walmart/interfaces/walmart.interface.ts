/**
 * Walmart Chile Marketplace Interfaces
 */

// Respuesta del endpoint de autenticación
export interface WalmartTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number; // 900 segundos = 15 minutos
}

// Producto/Inventario de Walmart
export interface WalmartInventory {
    sku: string;
    quantity: {
        unit: string;
        amount: number;
    };
    fulfillmentLagTime?: number;
}

// Respuesta de inventario
export interface WalmartInventoryResponse {
    sku: string;
    quantity: {
        unit: string;
        amount: number;
    };
    fulfillmentLagTime: number;
}

// Order de Walmart
export interface WalmartOrder {
    purchaseOrderId: string;
    customerOrderId: string;
    orderDate: string;
    shippingInfo: {
        phone: string;
        postalAddress: {
            name: string;
            address1: string;
            address2?: string;
            city: string;
            state: string;
            postalCode: string;
            country: string;
        };
    };
    orderLines: {
        lineNumber: string;
        item: {
            productName: string;
            sku: string;
        };
        charges: {
            chargeType: string;
            chargeAmount: {
                currency: string;
                amount: number;
            };
        }[];
        orderLineQuantity: {
            unitOfMeasurement: string;
            amount: string;
        };
        statusDate: string;
        orderLineStatuses: {
            status: string;
            statusQuantity: {
                unitOfMeasurement: string;
                amount: string;
            };
        }[];
    }[];
}

// Respuesta genérica de la API
export interface WalmartApiResponse<T> {
    list?: {
        meta: {
            totalCount: number;
            limit: number;
            nextCursor: string | null;
        };
        elements: T;
    };
    errors?: {
        error: {
            code: string;
            description: string;
        }[];
    };
}

// Para actualización de stock
export interface WalmartStockUpdate {
    sku: string;
    quantity: number;
}
