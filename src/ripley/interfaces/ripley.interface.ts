// Interfaces para Ripley (Mirakl API)

export interface RipleyOffer {
    offer_id?: number;
    product_id: string;
    product_id_type: 'SHOP_SKU' | 'EAN' | 'ISBN';
    shop_sku: string;
    quantity: number;
    price?: number;
    state_code?: string;
    active?: boolean;
    category_code?: string;
    category_label?: string;
    currency_iso_code?: string;
}

export interface RipleyStockUpdate {
    product_id: string;
    product_id_type: 'SHOP_SKU';
    shop_sku: string;
    quantity: number;
    state_code?: string;
    update_delete: 'update' | 'delete';
}

export interface RipleyOrder {
    order_id: string;
    commercial_id?: string;
    created_date: string;
    customer: {
        billing_address?: {
            city?: string;
            country?: string;
            street_1?: string;
            company?: string;
            firstname?: string;
            lastname?: string;
            phone?: string;
        };
        customer_id: string;
        email?: string;
        firstname?: string;
        lastname?: string;
    };
    order_lines: Array<{
        offer_sku: string;
        quantity: number;
        price?: number;
        product_title?: string;
        order_line_id?: string;
    }>;
    shipping?: {
        price?: number;
        carrier_code?: string;
    };
}

export interface RipleyApiResponse<T> {
    data?: T;
    offers?: T;
    orders?: T;
    import_id?: number;
    message?: string;
    status?: number;
}
