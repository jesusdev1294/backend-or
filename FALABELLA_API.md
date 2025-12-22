# 🛒 Integración con Falabella Seller Center API

## 📋 Configuración

### Variables de Entorno

Agrega estas variables en tu archivo `.env` y en Railway:

```env
FALABELLA_API_URL=https://sellercenter-api.falabella.com
FALABELLA_USER_ID=tu_email@dominio.com
FALABELLA_API_KEY=tu_api_key_aqui
FALABELLA_SELLER_ID=HyperPc tecnologia
FALABELLA_VERSION=1.0
FALABELLA_FORMAT=JSON
```

### Obtener Credenciales

1. Ingresa a https://sellercenter.falabella.com/
2. Haz clic en **"Mi cuenta"** → **"Usuarios"**
3. Tu **User ID** es tu correo electrónico
4. Tu **API Key** está en la columna "Api Key"

## 🚀 Endpoints Disponibles

### 1. Actualizar Stock

**POST** `/falabella/stock/update`

```bash
curl -X POST https://tu-app.railway.app/falabella/stock/update \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      { "sku": "SKU-001", "quantity": 50 },
      { "sku": "SKU-002", "quantity": 30 }
    ]
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Stock updated successfully",
  "data": { ... }
}
```

### 2. Obtener Productos

**GET** `/falabella/products?search=laptop&limit=10&offset=0`

```bash
curl https://tu-app.railway.app/falabella/products?search=laptop&limit=10
```

**Parámetros:**
- `search` (opcional): Buscar por nombre o SKU
- `limit` (opcional, default: 100): Cantidad de resultados
- `offset` (opcional, default: 0): Para paginación

### 3. Obtener Producto por SKU

**GET** `/falabella/products/:sku`

```bash
curl https://tu-app.railway.app/falabella/products/SKU-001
```

### 4. Obtener Órdenes

**GET** `/falabella/orders?createdAfter=2025-01-01&limit=50`

```bash
curl "https://tu-app.railway.app/falabella/orders?createdAfter=2025-01-01T00:00:00%2B00:00&limit=50"
```

**Parámetros:**
- `createdAfter` (opcional): Fecha ISO 8601 (ej: 2025-01-01T00:00:00+00:00)
- `createdBefore` (opcional): Fecha ISO 8601
- `limit` (opcional, default: 100)
- `offset` (opcional, default: 0)

### 5. Obtener Orden Específica

**GET** `/falabella/orders/:orderId`

```bash
curl https://tu-app.railway.app/falabella/orders/123456789
```

### 6. Marcar Orden como Lista para Enviar

**POST** `/falabella/orders/ready-to-ship`

```bash
curl -X POST https://tu-app.railway.app/falabella/orders/ready-to-ship \
  -H "Content-Type: application/json" \
  -d '{
    "orderItemIds": ["12345", "12346"],
    "deliveryType": "dropship",
    "shippingProvider": "Chilexpress"
  }'
```

**Parámetros:**
- `orderItemIds`: Array de IDs de items de la orden
- `deliveryType` (opcional): "dropship" o "pickup"
- `shippingProvider` (opcional): Nombre del proveedor de envío

### 7. Webhook para Recibir Órdenes

**POST** `/falabella/webhook/order`

Este endpoint recibe webhooks de Falabella cuando hay nuevas órdenes.

```json
{
  "orderId": "123456",
  "products": [
    { "sku": "SKU-001", "quantity": 2, "price": 10.5 }
  ],
  "status": "pending",
  "timestamp": "2025-12-17T10:00:00Z"
}
```

## 🔐 Autenticación

La API de Falabella usa firma HMAC-SHA256. El servicio genera automáticamente:

1. **User-Agent Header**: 
   ```
   HyperPc tecnologia/node/22.13.0/PROPIA/FACL
   ```

2. **Signature**: Generada con HMAC-SHA256 de los parámetros ordenados alfabéticamente

3. **Parámetros Base** (en cada llamada):
   - Action: Método de la API
   - Format: JSON o XML
   - Timestamp: ISO 8601
   - UserID: Tu email
   - Version: 1.0
   - Signature: HMAC-SHA256

## 📊 Ver Logs

Todos los requests a Falabella se registran automáticamente:

```bash
curl https://tu-app.railway.app/logs?service=falabella
```

## 🧪 Pruebas Locales

```bash
# Iniciar el servidor
npm run start:dev

# Probar endpoint
curl http://localhost:3000/falabella/products?search=test
```

## ⚠️ Importante

- Los valores en JSON siempre deben ser strings, incluso números: `"quantity": "50"`
- El tamaño máximo del body en POST es 128MB
- Respeta los rate limits de la API de Falabella
- Mantén tus credenciales seguras (no las subas al repositorio)

## 🔧 Troubleshooting

### Error: Invalid Signature
- Verifica que `FALABELLA_API_KEY` sea correcto
- Asegúrate que el timestamp esté en formato ISO 8601

### Error: Unauthorized
- Verifica tu `FALABELLA_USER_ID` (email)
- Confirma que tu usuario tenga los permisos correctos en Seller Center

### Error: Product not found
- Confirma que el SKU exista en tu catálogo de Seller Center
- Verifica que el formato del SKU sea correcto
