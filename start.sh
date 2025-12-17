# Script para iniciar servicios necesarios y el servidor

echo "🚀 Iniciando servicios del Orquestador..."

# Verificar si MongoDB está corriendo
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB no está corriendo. Iniciando MongoDB..."
    mongod --fork --logpath /tmp/mongodb.log --dbpath /usr/local/var/mongodb
else
    echo "✅ MongoDB ya está corriendo"
fi

# Verificar si Redis está corriendo
if ! pgrep -x "redis-server" > /dev/null; then
    echo "⚠️  Redis no está corriendo. Iniciando Redis..."
    redis-server --daemonize yes
else
    echo "✅ Redis ya está corriendo"
fi

echo ""
echo "📦 Servicios listos:"
echo "   - MongoDB: mongodb://localhost:27017"
echo "   - Redis: localhost:6379"
echo ""
echo "🚀 Iniciando servidor NestJS..."
npm run start:dev
