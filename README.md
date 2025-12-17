# Backend Orquestador - NestJS

Backend del orquestador desarrollado con NestJS y expuesto públicamente con ngrok.

## 🚀 Inicio Rápido

### 1. Instalar dependencias
```bash
cd /Users/jesusdev/Documents/hyper-pc/orquestador/backend-or
npm install
```

### 2. Instalar ngrok (primera vez)
```bash
brew install ngrok/ngrok/ngrok
```

### 3. Ejecutar el servidor

**Terminal 1 - Servidor NestJS:**
```bash
npm run start:dev
```

El servidor se iniciará en `http://localhost:3000`

**Terminal 2 - ngrok (exponer públicamente):**
```bash
npm run ngrok
```

O manualmente:
```bash
ngrok http 3000
```

ngrok mostrará una URL pública como: `https://xxxx-xxxx-xxxx.ngrok-free.app`

## 🧪 Probar el Endpoint

### Localmente:
```bash
curl http://localhost:3000/test
```

### Desde afuera (con ngrok):
```bash
curl https://tu-url-de-ngrok.ngrok-free.app/test
```

### Respuesta esperada:
```json
{
  "message": "Test OK",
  "timestamp": "2025-12-15T12:34:56.789Z"
}
```

## 📁 Estructura del Proyecto

```
backend-or/
├── src/
│   ├── main.ts              # Punto de entrada (puerto 3000, CORS habilitado)
│   ├── app.module.ts        # Módulo raíz
│   └── app.controller.ts    # Controlador con endpoint /test
├── dist/                    # Compilado (autogenerado)
├── node_modules/            # Dependencias
├── package.json             # Configuración y scripts
├── tsconfig.json            # Configuración TypeScript
├── nest-cli.json            # Configuración NestJS CLI
└── .gitignore               # Exclusiones de Git
```

## 📜 Scripts Disponibles

- `npm run start:dev` - Ejecutar en modo desarrollo con hot-reload
- `npm run build` - Compilar el proyecto
- `npm run start:prod` - Ejecutar la versión compilada
- `npm run ngrok` - Exponer puerto 3000 con ngrok

## 🔧 Configuración

- **Puerto:** 3000 (configurado en `src/main.ts`)
- **CORS:** Habilitado para acceso externo
- **Endpoint de prueba:** `GET /test`

## ⚠️ Notas Importantes

- **ngrok es solo para desarrollo/testing**, no usar en producción
- La URL de ngrok cambia cada vez que reinicias el túnel (a menos que uses plan pago)
- Para mantener ngrok corriendo, no cierres la terminal donde se ejecuta

## 🔮 Próximos Pasos

1. ✅ Endpoint de prueba básico funcionando
2. ⏳ Implementar arquitectura limpia por capas
3. ⏳ Agregar validación de DTOs
4. ⏳ Implementar lógica del orquestador
5. ⏳ Agregar base de datos
6. ⏳ Implementar autenticación

---

**Desarrollado con NestJS** 🐱
