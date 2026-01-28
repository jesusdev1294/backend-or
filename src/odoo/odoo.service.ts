import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LogsService } from '../logs/logs.service';
import { OdooStockUpdate } from './interfaces/odoo.interface';

@Injectable()
export class OdooService {
  private readonly logger = new Logger(OdooService.name);
  private readonly apiClient: AxiosInstance;

  constructor(
    private configService: ConfigService,
    private logsService: LogsService,
  ) {
    this.apiClient = axios.create({
      baseURL: this.configService.get('ODOO_URL') || 'https://hyperpc3.odoo.com',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Obtiene credenciales de Odoo desde variables de entorno
   */
  private getCredentials() {
    return {
      db: this.configService.get('ODOO_DB') || 'hyperpc3',
      uid: parseInt(this.configService.get('ODOO_UID') || '5'),
      password: this.configService.get('ODOO_API_KEY'),
    };
  }

  /**
   * Paso 1: Buscar producto por SKU usando execute_kw
   */
  async searchProductBySku(sku: string): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'search_product',
      status: 'pending',
      request: { sku },
      productSku: sku,
    };

    try {
      this.logger.log(`Searching product in Odoo by SKU: ${sku}`);
      const { db, uid, password } = this.getCredentials();

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'product.product',
            'search_read',
            [
              [['default_code', '=', sku]],
              ['id', 'name', 'default_code', 'qty_available'],
            ],
          ],
        },
        id: 1,
      });

      const product = response.data.result?.[0];
      const duration = Date.now() - startTime;

      if (!product) {
        throw new Error(`Product with SKU ${sku} not found in Odoo`);
      }

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: product,
        duration,
      });

      return product;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error searching product in Odoo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Paso 2: Buscar stock.quant por product_id y location_id
   */
  async getStockQuant(productId: number, locationId: number = 8): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'get_stock_quant',
      status: 'pending',
      request: { productId, locationId },
    };

    try {
      this.logger.log(`Getting stock quant for product ${productId} at location ${locationId}`);
      const { db, uid, password } = this.getCredentials();

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'stock.quant',
            'search_read',
            [
              [
                ['product_id', '=', productId],
                ['location_id', '=', locationId],
              ],
              ['id', 'quantity'],
            ],
          ],
        },
        id: 1,
      });

      const stockQuant = response.data.result?.[0];
      const duration = Date.now() - startTime;

      if (!stockQuant) {
        throw new Error(`Stock quant not found for product ${productId} at location ${locationId}`);
      }

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: stockQuant,
        duration,
      });

      return stockQuant;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error getting stock quant: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reduce stock siguiendo el flujo de 4 pasos de Odoo
   */
  async reduceStock(sku: string, quantity: number, orderId?: string): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'reduce_stock',
      status: 'pending',
      request: { sku, quantity },
      productSku: sku,
      orderId,
    };

    try {
      this.logger.log(`Reducing stock in Odoo for SKU: ${sku}, Quantity: ${quantity}`);
      const { db, uid, password } = this.getCredentials();

      // Paso 1: Buscar producto por SKU
      const product = await this.searchProductBySku(sku);
      const productId = product.id;
      const currentStock = product.qty_available;

      this.logger.log(`Product found: ID=${productId}, Current Stock=${currentStock}`);

      // Paso 2: Buscar stock.quant
      const stockQuant = await this.getStockQuant(productId, 8);
      const stockQuantId = stockQuant.id;
      const stockQuantQuantity = stockQuant.quantity;

      this.logger.log(`Stock Quant found: ID=${stockQuantId}, Quantity=${stockQuantQuantity}`);

      // Calcular nuevo stock
      const newStock = stockQuantQuantity - quantity;
      if (newStock < 0) {
        throw new Error(`Insufficient stock. Current: ${stockQuantQuantity}, Requested: ${quantity}`);
      }

      // Paso 3: Actualizar inventory_quantity con write
      this.logger.log(`Updating inventory_quantity to ${newStock}`);
      const writeResponse = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'stock.quant',
            'write',
            [[stockQuantId], { inventory_quantity: newStock }],
          ],
        },
        id: 2,
      });

      if (!writeResponse.data.result) {
        throw new Error('Failed to update inventory_quantity');
      }

      this.logger.log('inventory_quantity updated, applying changes...');

      // Paso 4: Aplicar el ajuste con action_apply_inventory
      const applyResponse = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [db, uid, password, 'stock.quant', 'action_apply_inventory', [[stockQuantId]]],
        },
        id: 3,
      });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: {
          productId,
          stockQuantId,
          previousStock: stockQuantQuantity,
          newStock,
          writeResult: writeResponse.data.result,
          applyResult: applyResponse.data,
        },
        duration,
      });

      this.logger.log(`Stock reduced successfully for SKU: ${sku} (${stockQuantQuantity} -> ${newStock})`);
      return {
        success: true,
        productId,
        sku,
        previousStock: stockQuantQuantity,
        newStock,
        quantityReduced: quantity,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error reducing stock in Odoo: ${error.message}`);
      throw error;
    }
  }

  async increaseStock(sku: string, quantity: number): Promise<any> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'increase_stock',
      status: 'pending',
      request: { sku, quantity },
      productSku: sku,
    };

    try {
      this.logger.log(`Increasing stock in Odoo for SKU: ${sku}, Quantity: ${quantity}`);
      const { db, uid, password } = this.getCredentials();

      // Paso 1: Buscar producto por SKU
      const product = await this.searchProductBySku(sku);
      const productId = product.id;

      // Paso 2: Buscar stock.quant
      const stockQuant = await this.getStockQuant(productId, 8);
      const stockQuantId = stockQuant.id;
      const currentStock = stockQuant.quantity;

      // Calcular nuevo stock
      const newStock = currentStock + quantity;

      // Paso 3: Actualizar inventory_quantity
      await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'stock.quant',
            'write',
            [[stockQuantId], { inventory_quantity: newStock }],
          ],
        },
        id: 2,
      });

      // Paso 4: Aplicar el ajuste
      await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [db, uid, password, 'stock.quant', 'action_apply_inventory', [[stockQuantId]]],
        },
        id: 3,
      });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: { productId, previousStock: currentStock, newStock },
        duration,
      });

      this.logger.log(`Stock increased successfully for SKU: ${sku} (${currentStock} -> ${newStock})`);
      return { success: true, productId, sku, previousStock: currentStock, newStock, quantityAdded: quantity };
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error increasing stock in Odoo: ${error.message}`);
      throw error;
    }
  }

  async getStockBySku(sku: string): Promise<number> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'get_stock',
      status: 'pending',
      request: { sku },
      productSku: sku,
    };

    try {
      this.logger.log(`Getting stock from Odoo for SKU: ${sku}`);

      // Buscar producto (ya trae qty_available)
      const product = await this.searchProductBySku(sku);
      const stock = product.qty_available || 0;

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: { stock, productId: product.id },
        duration,
      });

      return stock;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });

      this.logger.error(`Error getting stock from Odoo: ${error.message}`);
      throw error;
    }
  }

  // ============================================================
  // MÉTODOS PARA CREACIÓN DE PEDIDOS
  // ============================================================

  /**
   * Buscar cliente por email (llave principal)
   */
  async searchPartnerByEmail(email: string): Promise<any | null> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'search_partner_by_email',
      status: 'pending',
      request: { email },
    };

    try {
      this.logger.log(`Searching partner by email: ${email}`);
      const { db, uid, password } = this.getCredentials();

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'res.partner',
            'search_read',
            [
              [['email', '=', email]],
              ['id', 'name', 'email', 'vat', 'parent_id', 'type'],
            ],
          ],
        },
        id: 301,
      });

      const partner = response.data.result?.[0] || null;
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: partner,
        duration,
      });

      return partner;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });
      this.logger.error(`Error searching partner: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear cliente nuevo en Odoo
   */
  async createPartner(data: {
    name: string;
    email: string;
    phone?: string;
    vat?: string;
  }): Promise<number> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'create_partner',
      status: 'pending',
      request: data,
    };

    try {
      this.logger.log(`Creating partner: ${data.name}`);
      const { db, uid, password } = this.getCredentials();

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'res.partner',
            'create',
            [data],
          ],
        },
        id: 302,
      });

      const partnerId = response.data.result;
      const duration = Date.now() - startTime;

      if (!partnerId) {
        throw new Error('Failed to create partner');
      }

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: { partnerId },
        duration,
      });

      this.logger.log(`Partner created with ID: ${partnerId}`);
      return partnerId;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });
      this.logger.error(`Error creating partner: ${error.message}`);
      throw error;
    }
  }

  /**
   * Buscar contacto de facturación por parent_id y vat
   */
  async searchInvoiceContact(parentId: number, vat: string): Promise<any | null> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'search_invoice_contact',
      status: 'pending',
      request: { parentId, vat },
    };

    try {
      this.logger.log(`Searching invoice contact for parent ${parentId}, vat ${vat}`);
      const { db, uid, password } = this.getCredentials();

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'res.partner',
            'search_read',
            [
              [
                ['parent_id', '=', parentId],
                ['type', '=', 'invoice'],
                ['vat', '=', vat],
              ],
              ['id', 'name', 'vat', 'type', 'parent_id'],
            ],
          ],
        },
        id: 304,
      });

      const contact = response.data.result?.[0] || null;
      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: contact,
        duration,
      });

      return contact;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });
      this.logger.error(`Error searching invoice contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear contacto de facturación
   */
  async createInvoiceContact(data: {
    parent_id: number;
    name: string;
    vat: string;
    email?: string;
    street?: string;
    city?: string;
  }): Promise<number> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'create_invoice_contact',
      status: 'pending',
      request: data,
    };

    try {
      this.logger.log(`Creating invoice contact for parent ${data.parent_id}`);
      const { db, uid, password } = this.getCredentials();

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'res.partner',
            'create',
            [{ ...data, type: 'invoice' }],
          ],
        },
        id: 305,
      });

      const contactId = response.data.result;
      const duration = Date.now() - startTime;

      if (!contactId) {
        throw new Error('Failed to create invoice contact');
      }

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: { contactId },
        duration,
      });

      this.logger.log(`Invoice contact created with ID: ${contactId}`);
      return contactId;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });
      this.logger.error(`Error creating invoice contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Buscar producto de envío por marketplace (ENVFALLA, ENVRIP, ENVPAR, etc)
   */
  async searchShippingProduct(marketplace: string): Promise<any> {
    const skuMap: Record<string, string> = {
      falabella: 'ENVFALLA',
      ripley: 'ENVRIP',
      paris: 'ENVPAR',
      mercadolibre: 'ENVML',
    };

    const sku = skuMap[marketplace.toLowerCase()] || `ENV${marketplace.toUpperCase().substring(0, 4)}`;
    return this.searchProductBySku(sku);
  }

  /**
   * Crear orden de venta en Odoo
   */
  async createSaleOrder(data: {
    partnerId: number;
    partnerInvoiceId?: number;
    partnerShippingId?: number;
    clientOrderRef: string;
    origin: string;
    note?: string;
    orderLines: Array<{
      productId: number;
      quantity: number;
      priceUnit: number;
      name: string;
    }>;
  }): Promise<number> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'create_sale_order',
      status: 'pending',
      request: data,
      orderId: data.clientOrderRef,
    };

    try {
      this.logger.log(`Creating sale order: ${data.clientOrderRef}`);
      const { db, uid, password } = this.getCredentials();

      // Construir líneas de orden en formato Odoo
      const orderLineData = data.orderLines.map((line) => [
        0,
        0,
        {
          product_id: line.productId,
          product_uom_qty: line.quantity,
          price_unit: line.priceUnit,
          name: line.name,
        },
      ]);

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            password,
            'sale.order',
            'create',
            [
              {
                partner_id: data.partnerId,
                partner_invoice_id: data.partnerInvoiceId || data.partnerId,
                partner_shipping_id: data.partnerShippingId || data.partnerId,
                client_order_ref: data.clientOrderRef,
                origin: data.origin,
                note: data.note || '',
                order_line: orderLineData,
              },
            ],
          ],
        },
        id: 308,
      });

      const orderId = response.data.result;
      const duration = Date.now() - startTime;

      if (!orderId) {
        throw new Error('Failed to create sale order');
      }

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: { orderId },
        duration,
      });

      this.logger.log(`Sale order created with ID: ${orderId}`);
      return orderId;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });
      this.logger.error(`Error creating sale order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Confirmar orden de venta
   */
  async confirmSaleOrder(orderId: number): Promise<boolean> {
    const startTime = Date.now();
    const logData = {
      service: 'odoo',
      action: 'confirm_sale_order',
      status: 'pending',
      request: { orderId },
    };

    try {
      this.logger.log(`Confirming sale order: ${orderId}`);
      const { db, uid, password } = this.getCredentials();

      const response = await this.apiClient.post('/jsonrpc', {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [db, uid, password, 'sale.order', 'action_confirm', [[orderId]]],
        },
        id: 309,
      });

      const duration = Date.now() - startTime;

      await this.logsService.create({
        ...logData,
        status: 'success',
        response: response.data,
        duration,
      });

      this.logger.log(`Sale order ${orderId} confirmed successfully`);
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logsService.create({
        ...logData,
        status: 'error',
        errorMessage: error.message,
        duration,
      });
      this.logger.error(`Error confirming sale order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Procesar orden completa de marketplace (flujo completo)
   * 1. Buscar/crear cliente
   * 2. Buscar/crear contacto facturación (si aplica)
   * 3. Buscar productos
   * 4. Crear orden de venta
   * 5. Confirmar orden
   * 6. Reducir stock
   */
  async processMarketplaceOrder(orderData: {
    marketplace: string;
    orderId: string;
    customer: {
      name: string;
      email: string;
      phone?: string;
      nationalId?: string; // RUT personal
      legalId?: string; // RUT empresa (para facturación)
      billingName?: string;
      billingStreet?: string;
      billingCity?: string;
    };
    items: Array<{
      sku: string;
      quantity: number;
      price: number;
      name: string;
    }>;
    shippingPrice?: number;
  }): Promise<{
    success: boolean;
    partnerId: number;
    invoiceContactId?: number;
    saleOrderId: number;
    stockUpdates: any[];
  }> {
    const startTime = Date.now();
    const { marketplace, orderId, customer, items, shippingPrice } = orderData;
    const prefix = marketplace.toUpperCase().substring(0, 3);

    this.logger.log(`\n🚀 Processing ${marketplace} order: ${orderId}`);
    this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      // ═══════════════════════════════════════════════════════════
      // PASO 1: Buscar o crear cliente
      // ═══════════════════════════════════════════════════════════
      this.logger.log(`\n📌 Paso 1: Cliente`);
      let partnerId: number;
      let existingPartner = await this.searchPartnerByEmail(customer.email);

      if (existingPartner) {
        partnerId = existingPartner.id;
        this.logger.log(`✅ Cliente encontrado: ID=${partnerId}, ${existingPartner.name}`);
      } else {
        // Usar legalId si existe, sino nationalId
        const vat = customer.legalId || customer.nationalId;
        partnerId = await this.createPartner({
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          vat,
        });
        this.logger.log(`✅ Cliente creado: ID=${partnerId}`);
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 2: Contacto de facturación (si hay legalId diferente)
      // ═══════════════════════════════════════════════════════════
      let invoiceContactId: number | undefined;
      
      if (customer.legalId && customer.billingName) {
        this.logger.log(`\n📌 Paso 2: Contacto de Facturación`);
        
        let invoiceContact = await this.searchInvoiceContact(partnerId, customer.legalId);
        
        if (invoiceContact) {
          invoiceContactId = invoiceContact.id;
          this.logger.log(`✅ Contacto facturación encontrado: ID=${invoiceContactId}`);
        } else {
          invoiceContactId = await this.createInvoiceContact({
            parent_id: partnerId,
            name: customer.billingName,
            vat: customer.legalId,
            email: customer.email,
            street: customer.billingStreet,
            city: customer.billingCity,
          });
          this.logger.log(`✅ Contacto facturación creado: ID=${invoiceContactId}`);
        }
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 3: Buscar productos
      // ═══════════════════════════════════════════════════════════
      this.logger.log(`\n📌 Paso 3: Productos`);
      const orderLines: Array<{
        productId: number;
        quantity: number;
        priceUnit: number;
        name: string;
      }> = [];

      for (const item of items) {
        const product = await this.searchProductBySku(item.sku);
        if (!product) {
          throw new Error(`Producto no encontrado: ${item.sku}`);
        }
        this.logger.log(`✅ Producto: ${item.sku} → ID=${product.id}`);
        
        // Precio sin IVA (dividir por 1.19)
        const priceWithoutTax = item.price / 1.19;
        
        orderLines.push({
          productId: product.id,
          quantity: item.quantity,
          priceUnit: priceWithoutTax,
          name: `${item.sku} - ${item.name}`,
        });
      }

      // Agregar producto de envío si corresponde
      if (shippingPrice && shippingPrice > 0) {
        try {
          const shippingProduct = await this.searchShippingProduct(marketplace);
          const shippingPriceWithoutTax = shippingPrice / 1.19;
          
          orderLines.push({
            productId: shippingProduct.id,
            quantity: 1,
            priceUnit: shippingPriceWithoutTax,
            name: `Envío ${marketplace}`,
          });
          this.logger.log(`✅ Envío: ${shippingProduct.default_code} → ID=${shippingProduct.id}`);
        } catch (e) {
          this.logger.warn(`⚠️ Producto de envío no encontrado para ${marketplace}`);
        }
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 4: Crear orden de venta
      // ═══════════════════════════════════════════════════════════
      this.logger.log(`\n📌 Paso 4: Crear Orden de Venta`);
      const saleOrderId = await this.createSaleOrder({
        partnerId,
        partnerInvoiceId: invoiceContactId || partnerId,
        partnerShippingId: partnerId,
        clientOrderRef: `${prefix}-${orderId}`,
        origin: marketplace,
        note: `${marketplace} OrderId=${orderId}`,
        orderLines,
      });
      this.logger.log(`✅ Orden creada: ID=${saleOrderId}`);

      // ═══════════════════════════════════════════════════════════
      // PASO 5: Confirmar orden
      // ═══════════════════════════════════════════════════════════
      this.logger.log(`\n📌 Paso 5: Confirmar Orden`);
      await this.confirmSaleOrder(saleOrderId);
      this.logger.log(`✅ Orden confirmada`);

      // ═══════════════════════════════════════════════════════════
      // PASO 6: Reducir stock
      // ═══════════════════════════════════════════════════════════
      this.logger.log(`\n📌 Paso 6: Reducir Stock`);
      const stockUpdates: any[] = [];
      
      for (const item of items) {
        const result = await this.reduceStock(item.sku, item.quantity, orderId);
        stockUpdates.push(result);
        this.logger.log(`✅ Stock reducido: ${item.sku} (${result.previousStock} → ${result.newStock})`);
      }

      const duration = Date.now() - startTime;
      this.logger.log(`\n✅ Orden ${orderId} procesada exitosamente en ${duration}ms`);
      this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      return {
        success: true,
        partnerId,
        invoiceContactId,
        saleOrderId,
        stockUpdates,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`\n❌ Error procesando orden ${orderId}: ${error.message}`);
      this.logger.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      await this.logsService.create({
        service: 'odoo',
        action: 'process_marketplace_order',
        status: 'error',
        request: orderData,
        errorMessage: error.message,
        duration,
        orderId,
      });

      throw error;
    }
  }
}
