export interface FalabellaOrder {
  orderId: string;
  products: FalabellaProduct[];
  status: string;
  timestamp: string;
}

export interface FalabellaProduct {
  sku: string;
  quantity: number;
  price: number;
}

export interface FalabellaStockUpdate {
  sku: string;
  quantity: number;
  warehouse?: string;
}
