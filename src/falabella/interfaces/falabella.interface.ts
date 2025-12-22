// Órdenes
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
  name?: string;
}

// Actualización de stock
export interface FalabellaStockUpdate {
  sku: string;
  quantity: number;
  warehouse?: string;
}

export interface UpdateStockRequest {
  products: Array<{
    sku: string;
    quantity: number;
  }>;
}

// Productos
export interface FalabellaProductResponse {
  SuccessResponse?: {
    Head: {
      RequestId: string;
      RequestAction: string;
      ResponseType: string;
      Timestamp: string;
    };
    Body: {
      Products: {
        Product: FalabellaProductDetail[];
      };
    };
  };
}

export interface FalabellaProductDetail {
  SellerSku: string;
  ShopSku?: string;
  Name: string;
  Description?: string;
  Brand?: string;
  Price: string;
  SalePrice?: string;
  SaleStartDate?: string;
  SaleEndDate?: string;
  Status: string;
  Quantity: string;
  ProductId?: string;
  ParentSku?: string;
  Variation?: string;
}

// Órdenes desde API
export interface FalabellaOrdersResponse {
  SuccessResponse?: {
    Head: {
      RequestId: string;
      RequestAction: string;
      ResponseType: string;
      Timestamp: string;
    };
    Body: {
      Orders: {
        Order: FalabellaOrderDetail[];
      };
    };
  };
}

export interface FalabellaOrderDetail {
  OrderId: string;
  OrderNumber: string;
  CustomerFirstName: string;
  CustomerLastName: string;
  OrderItems: {
    OrderItem: FalabellaOrderItem[];
  };
  AddressBilling?: any;
  AddressShipping?: any;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface FalabellaOrderItem {
  OrderItemId: string;
  ShopId: string;
  OrderId: string;
  Name: string;
  Sku: string;
  Status: string;
  Price: string;
  ShippingAmount: string;
  TaxAmount: string;
  Reason?: string;
  ReasonDetail?: string;
  PurchaseOrderId?: string;
  PurchaseOrderNumber?: string;
  PackageId?: string;
  ShippingProviderType?: string;
  TrackingCode?: string;
}

// Ready to Ship
export interface SetStatusToReadyToShipRequest {
  orderItemIds: string[];
  deliveryType?: string;
  shippingProvider?: string;
}

// Respuesta genérica
export interface FalabellaApiResponse {
  SuccessResponse?: {
    Head: any;
    Body: any;
  };
  ErrorResponse?: {
    Head: {
      ErrorCode: string;
      ErrorMessage: string;
      ErrorType: string;
      RequestId: string;
      RequestAction: string;
      ResponseType: string;
      Timestamp: string;
    };
  };
}

