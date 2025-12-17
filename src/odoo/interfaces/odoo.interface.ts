export interface OdooProduct {
  id: number;
  name: string;
  default_code: string; // SKU
  qty_available: number;
}

export interface OdooStockUpdate {
  product_id: number;
  location_id: number;
  quantity: number;
  move_type: 'in' | 'out';
}

export interface OdooAuthResponse {
  uid: number;
  session_id: string;
}
