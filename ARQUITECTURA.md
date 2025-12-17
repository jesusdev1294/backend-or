# Arquitectura del Orquestador Marketplace

## 📋 Descripción General

Sistema de orquestación entre marketplace (Falabella) y ERP (Odoo) para sincronización de inventario en tiempo real.

## 🏗️ Arquitectura

```
┌─────────────┐         ┌──────────────┐         ┌─────────┐
│  Falabella  │────────>│ Orquestador  │────────>│  Odoo   │
│ (Marketplace)│<────────│   (NestJS)   │<────────│  (ERP)  │
└─────────────┘         └──────────────┘         └─────────┘
                              │
                              │
                        ┌─────▼──────┐
                        │   Redis    │
                        │  (Queues)  │
                        └────────────┘
                              │
                        ┌─────▼──────┐
                        │  MongoDB   │
                        │   (Logs)   │
                        └────────────┘
```

## 🔄 Flujos de Datos

### Flujo 1: Nueva Orden en Falabella → Reducir Stock en Odoo

1. **Falabella** envía webhook con orden nueva
2. **Orquestador** recibe webhook y valida firma
3. Se guarda log en **MongoDB**
4. Se agrega tarea a cola **Redis** (Bull)
5. **Worker** procesa cola y reduce stock en **Odoo**
6. Se registra resultado en **MongoDB**

### Flujo 2: Actualización de Stock en Odoo → Actualizar Falabella

1. **Odoo** notifica cambio de stock vía webhook
2. **Orquestador** recibe notificación
3. Se guarda log en **MongoDB**
4. Se agrega tarea a cola **Redis**
5. **Worker** actualiza stock en **Falabella** vía API
6. Se registra resultado en **MongoDB**

## 📁 Estructura del Proyecto

```
src/
├── common/
│   └── interceptors/
│       └── logging.interceptor.ts    # Interceptor global de logs
├── falabella/
│   ├── interfaces/
│   │   └── falabella.interface.ts    # Tipos de Falabella
│   ├── falabella.controller.ts       # Endpoints webhooks
│   ├── falabella.service.ts          # Lógica API Falabella
│   └── falabella.module.ts
├── odoo/
│   ├── interfaces/
│   │   └── odoo.interface.ts         # Tipos de Odoo
│   ├── odoo.controller.ts            # Endpoints webhooks
│   ├── odoo.service.ts               # Lógica API Odoo
│   └── odoo.module.ts
├── logs/
│   ├── schemas/
│   │   └── log.schema.ts             # Schema MongoDB
│   ├── logs.controller.ts            # API consulta logs
│   ├── logs.service.ts               # Servicio de logs
│   └── logs.module.ts
├── queues/
│   ├── stock.processor.ts            # Workers Bull
│   └── queues.module.ts
├── app.module.ts                     # Módulo principal
└── main.ts                           # Bootstrap

```

## 🔧 Tecnologías

- **NestJS**: Framework backend
- **MongoDB**: Base de datos para logs (Mongoose)
- **Redis**: Sistema de colas (Bull)
- **Axios**: Cliente HTTP para APIs
- **Bull**: Procesamiento de colas asíncrono

## 📊 Sistema de Logs

Todos los requests se registran automáticamente en MongoDB con:

- **service**: Origen (falabella, odoo, orchestrator, api)
- **action**: Acción realizada
- **status**: success, error, pending
- **request/response**: Datos de entrada/salida
- **duration**: Tiempo de ejecución (ms)
- **orderId/productSku**: Referencias
- **timestamp**: Fecha/hora automática

## 🚀 Endpoints

### Webhooks

- `POST /falabella/webhook/order` - Recibir órdenes de Falabella
- `POST /falabella/webhook/stock` - Recibir actualizaciones stock
- `POST /odoo/webhook/stock-change` - Recibir cambios de Odoo

### APIs

- `GET /logs` - Obtener logs (con filtros)
- `GET /logs/order/:orderId` - Logs por orden
- `GET /logs/product/:sku` - Logs por producto
- `GET /odoo/stock/:sku` - Consultar stock en Odoo
- `POST /odoo/stock/reduce` - Reducir stock manualmente
- `POST /odoo/stock/increase` - Aumentar stock manualmente

### Monitoreo

- `GET /` - Estado del servicio
- `GET /health` - Health check

## ⚙️ Configuración

### Variables de Entorno (.env)

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/orquestador

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Falabella API
FALABELLA_API_URL=https://api.falabella.com
FALABELLA_API_KEY=your_falabella_api_key
FALABELLA_WEBHOOK_SECRET=your_webhook_secret

# Odoo API
ODOO_URL=https://your-odoo-instance.com
ODOO_DB=your_database
ODOO_USERNAME=your_username
ODOO_PASSWORD=your_password

# App
PORT=3000
NODE_ENV=development
```

## 📦 Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar servicios locales
# MongoDB
mongod

# Redis
redis-server

# Iniciar aplicación
npm run start:dev
```

## 🧪 Testing

```bash
# Ejemplo webhook Falabella
curl -X POST http://localhost:3000/falabella/webhook/order \
  -H "Content-Type: application/json" \
  -H "x-falabella-signature: your_webhook_secret" \
  -d '{
    "orderId": "FAL-12345",
    "products": [
      {
        "sku": "PROD-001",
        "quantity": 2,
        "price": 29990
      }
    ],
    "status": "confirmed",
    "timestamp": "2025-12-16T10:00:00Z"
  }'

# Ver logs
curl http://localhost:3000/logs

# Ver logs de una orden
curl http://localhost:3000/logs/order/FAL-12345
```

## 🔐 Seguridad

- Validación de firmas en webhooks
- CORS habilitado (configurar en producción)
- Validación de datos con class-validator
- Logs completos de todas las operaciones

## 📈 Escalabilidad

- **Colas Redis**: Procesamiento asíncrono
- **Workers Bull**: Puede escalar horizontalmente
- **MongoDB**: Índices en campos frecuentes
- **Logs estructurados**: Fácil análisis y monitoreo

## 🔄 Próximos Pasos

1. Agregar más marketplaces (Mercado Libre, Ripley, etc)
2. Sistema de reintentos automáticos
3. Dashboard de monitoreo
4. Alertas por email/Slack
5. Rate limiting
6. Caché de consultas frecuentes
7. Tests unitarios e integración
