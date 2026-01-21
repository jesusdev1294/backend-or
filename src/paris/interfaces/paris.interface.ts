// Interfaces para Paris (Cencosud API)

export interface ParisProduct {
    sku: string;
    name?: string;
    description?: string;
    price?: number;
    stock?: number;
    status?: string;
    category?: string;
    brand?: string;
}

export interface ParisStockUpdate {
    sku: string;
    quantity: number;
    warehouseId?: string;
}

export interface ParisOrder {
    orderId: string;
    orderNumber?: string;
    createdAt: string;
    status: string;
    customer: {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        rut?: string;
        billingAddress?: {
            street?: string;
            city?: string;
            region?: string;
            zipCode?: string;
        };
        shippingAddress?: {
            street?: string;
            city?: string;
            region?: string;
            zipCode?: string;
        };
    };
    items: Array<{
        sku: string;
        name?: string;
        quantity: number;
        price: number;
        totalPrice?: number;
    }>;
    shipping?: {
        method?: string;
        price?: number;
        carrier?: string;
    };
    totals?: {
        subtotal?: number;
        shipping?: number;
        tax?: number;
        total?: number;
    };
}

export interface ParisApiResponse<T> {
    success?: boolean;
    data?: T;
    products?: T;
    orders?: T;
    message?: string;
    error?: string;
    pagination?: {
        page?: number;
        limit?: number;
        total?: number;
    };
}
