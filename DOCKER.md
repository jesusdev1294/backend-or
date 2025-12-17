# 🐳 Docker Setup para Orquestador

## Servicios incluidos

- **MongoDB** (puerto 27017) - Base de datos para logs
- **Redis** (puerto 6379) - Sistema de colas
- **Mongo Express** (puerto 8082) - UI para MongoDB
- **Redis Commander** (puerto 8081) - UI para Redis

## 🚀 Comandos rápidos

```bash
# Iniciar todos los servicios
npm run docker:up

# O directamente con docker-compose
docker-compose up -d

# Ver logs de los contenedores
npm run docker:logs

# Detener servicios
npm run docker:down

# Ver estado de contenedores
docker-compose ps
```

## 🔗 URLs de acceso

- **MongoDB**: `mongodb://localhost:27017/orquestador`
- **Redis**: `localhost:6379`
- **Mongo Express**: http://localhost:8082 (usuario: admin, password: admin123)
- **Redis Commander**: http://localhost:8081

## 📝 Iniciar aplicación completa

```bash
# 1. Iniciar servicios con Docker
npm run docker:up

# 2. Esperar unos segundos a que inicien

# 3. Iniciar el servidor NestJS
npm run start:dev
```

## 🛠️ Gestión de datos

```bash
# Ver volúmenes
docker volume ls

# Eliminar datos (cuidado!)
docker-compose down -v

# Reiniciar servicios
docker-compose restart

# Ver logs de un servicio específico
docker-compose logs -f mongodb
docker-compose logs -f redis
```

## ⚙️ Configuración

El archivo `.env` ya está configurado para usar estos servicios:

```env
MONGODB_URI=mongodb://localhost:27017/orquestador
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 🔍 Health Checks

Los servicios tienen health checks configurados para verificar que están funcionando correctamente:

```bash
# Verificar salud de MongoDB
docker exec orquestador-mongodb mongosh --eval "db.adminCommand('ping')"

# Verificar salud de Redis
docker exec orquestador-redis redis-cli ping
```
