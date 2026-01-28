# 🛒 Orquestador de Marketplaces - Hyper PC

Sistema de orquestación multi-marketplace desarrollado con NestJS que sincroniza inventario entre **Falabella**, **Ripley**, **Paris** y **Odoo** (ERP).

## 🚀 Inicio Rápido

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con las credenciales correctas
```

### 3. Levantar servicios (MongoDB + Redis)
```bash
# Con Docker/Colima mas ligero
DOCKER_CONTEXT=colima docker-compose up -d

# Verificar
docker ps
```

### 4. Ejecutar el servidor
```bash
npm run start:dev
```

El servidor se iniciará en `http://localhost:3000`

### 5. (Opcional) Exponer con ngrok para webhooks
```bash
ngrok http 3000
```

## 🧪 Testing

### Health Check:
```bash
curl http://localhost:3000/health
```

### Falabella:
```bash
# Listar productos
curl http://localhost:3000/falabella/products

# Webhook (simulado)
curl -X POST http://localhost:3000/falabella/webhook/order \
  -H "Content-Type: application/json" \
  -d '{"event": "onOrderItemsStatusChanged", "payload": {...}}'
```

### Ripley:
```bash
# Health check
curl http://localhost:3000/ripley/health

# Listar productos
curl http://localhost:3000/ripley/products?max=5
```

### Paris:
```bash
# Listar órdenes
curl http://localhost:3000/paris/orders
```

### Odoo:
```bash
# Consultar stock
curl http://localhost:3000/odoo/stock/SKU-PRODUCTO
```

## 📁 Estructura del Proyecto

```
backend-or/
├── src/
│   ├── main.ts                    # Punto de entrada
│   ├── app.module.ts              # Módulo raíz
│   ├── app.controller.ts          # Health check
│   ├── falabella/                 # Módulo Falabella
│   │   ├── falabella.controller.ts
│   │   ├── falabella.service.ts
│   │   ├── falabella.module.ts
│   │   └── interfaces/
│   ├── ripley/                    # Módulo Ripley (Mirakl)
│   │   ├── ripley.controller.ts
│   │   ├── ripley.service.ts
│   │   ├── ripley.module.ts
│   │   └── interfaces/
│   ├── paris/                     # Módulo Paris (Cencosud)
│   │   ├── paris.controller.ts
│   │   ├── paris.service.ts
│   │   ├── paris.module.ts
│   │   └── interfaces/
│   ├── odoo/                      # Módulo Odoo (ERP)
│   │   ├── odoo.controller.ts
│   │   ├── odoo.service.ts
│   │   ├── odoo.module.ts
│   │   └── interfaces/
│   ├── queues/                    # Sistema de colas (Bull)
│   │   ├── queues.module.ts
│   │   └── stock.processor.ts    # Sincronización
│   └── common/                    # Utilidades comunes
│       └── interceptors/
├── docker-compose.yml             # MongoDB + Redis
├── .env                           # Variables de entorno (no en Git)
├── .env.example                   # Template de variables
└── package.json
```

## 📜 Scripts Disponibles

- `npm run start:dev` - Ejecutar en modo desarrollo con hot-reload
- `npm run build` - Compilar el proyecto
- `npm run start:prod` - Ejecutar la versión compilada
- `npm run ngrok` - Exponer puerto 3000 con ngrok

## 🔧 Configuración

### Stack Tecnológico:
- **Framework:** NestJS + TypeScript
- **Base de Datos:** MongoDB Atlas (logs y auditoría)
- **Colas:** Redis + Bull (procesamiento asíncrono)
- **ERP:** Odoo (fuente de verdad del inventario)
- **Deploy:** Railway (producción)

### Variables de Entorno:
Ver `.env.example` para el template completo. Necesitas configurar:
- Credenciales de Falabella (API Key, Seller ID)
- Credenciales de Ripley/Mirakl (API Key, Shop ID)
- Credenciales de Paris/Cencosud (API Key, Seller ID)
- Credenciales de Odoo (URL, DB, UID, API Key)
- MongoDB URI
- Redis (host, port)

## 🔄 Flujo de Sincronización

1. **Marketplace recibe venta** (Falabella/Ripley/Paris)
2. **Webhook → Orquestador** recibe notificación
3. **Crear orden en Odoo** con datos del cliente
4. **Reducir stock en Odoo** (fuente de verdad)
5. **Sincronizar con TODOS los marketplaces** (excepto origen)

**Ejemplo:** Venta en Ripley con 10 unidades en stock:
- ✅ Reduce stock en Odoo: 10 → 9
- ✅ Actualiza Falabella: 9 unidades
- ✅ Actualiza Paris: 9 unidades
- ✅ Ripley ya lo sabe (origen)

## 📚 Documentación

### APIs de Marketplaces:
- **Ripley/Mirakl:** https://help.mirakl.net/api-docs/
- **Paris/Cencosud:** https://developers.ecomm.cencosud.com/docs
- **Falabella:** Documentación en Seller Center

## ⚠️ Notas Importantes

### Particularidades por Marketplace:

**Falabella:**
- Usa firma HMAC-SHA256 con `encodeURIComponent()`
- Requiere User ID + API Key

**Ripley (Mirakl):**
- Autenticación simple con API Key
- Endpoint `/offers` (no `/products`)
- Documentación: https://help.mirakl.net/api-docs/

**Paris (Cencosud):**
- **NO tiene endpoint GET /products**
- Solo GET `/v1/orders` y PUT `/v1/stock`
- Funciona con órdenes entrantes y actualización de stock
- Documentación: https://developers.ecomm.cencosud.com/docs

### Para Desarrollo Local:
- Usa Docker/Colima para MongoDB y Redis
- ngrok solo para testing de webhooks

## ✅ Estado Actual

- ✅ Falabella implementado y funcionando
- ✅ Ripley implementado y funcionando
- ✅ Paris implementado y funcionando
- ✅ Walmart Chile implementado y validado
- ✅ Odoo integrado (ERP)
- ✅ Sincronización multi-marketplace
- ✅ Sistema de colas (Bull + Redis)
- ✅ Logs en MongoDB
- ✅ Deploy en Railway

## 🧪 Validación de APIs

### Walmart Chile Marketplace API ✅

Se realizaron pruebas exhaustivas de los endpoints principales de Walmart Chile según documentación oficial.

#### Autenticación OAuth 2.0
- **Endpoint**: `POST https://marketplace.walmartapis.com/v3/token`
- **Método**: Client Credentials con Basic Auth
- **Duración del token**: 15 minutos (900 segundos)
- **Status**: ✅ Funcionando correctamente

#### Consulta de Inventario
- **Endpoint**: `GET /v3/inventory?sku={SKU}`
- **Formato de respuesta**:
  ```json
  {
    "sku": "SKU_EJEMPLO",
    "quantity": {
      "unit": "EACH",
      "amount": 20
    }
  }
  ```
- **Status**: ✅ Validado con SKU de prueba

#### Consulta de Órdenes
- **Endpoint**: `GET /v3/orders?createdStartDate={date}&limit={limit}`
- **Parámetro requerido**: `createdStartDate` en formato ISO 8601
- **Status**: ✅ Funcionando correctamente

#### Headers Requeridos (Walmart CL)
Todos los endpoints autenticados requieren:
- `WM_SEC.ACCESS_TOKEN`: Token OAuth obtenido
- `WM_MARKET`: `cl` (identifica mercado Chile)
- `WM_SVC.NAME`: Nombre del servicio integrador
- `WM_QOS.CORRELATION_ID`: UUID único por request
- `Accept`: `application/json`
- `Content-Type`: `application/json`

#### Fix Implementado
Se corrigió el header de autenticación en `walmart.service.ts`:
- ❌ **Antes**: `Authorization: Bearer ${token}`
- ✅ **Ahora**: `WM_SEC.ACCESS_TOKEN: ${token}`

**Referencia**: Walmart CL Marketplace Partners API Documentation

---

**Desarrollado con NestJS** 🐱
