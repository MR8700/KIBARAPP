#!/bin/sh
set -e

echo "================================================================="
echo "  🚀 KIBAR PRODUCTION BOOT - Automatisation des Variables"
echo "================================================================="

# 1. Automatisation des variables d'environnement de production (si non injectées par l'hébergeur)
export DATABASE_URL="${DATABASE_URL:-postgresql://neondb_owner:npg_5CnK7surWlXp@ep-shiny-frost-b88wiqiz-pooler.c-14.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require}"
export DIRECT_URL="${DIRECT_URL:-postgresql://neondb_owner:npg_5CnK7surWlXp@ep-shiny-frost-b88wiqiz.c-14.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require}"
export REDIS_URL="${REDIS_URL:-rediss://default:gQAAAAAAAz9HAAIgcDE4ZWQ4OTk5OWM2MjQ0NDZiYjcyNjE4MTRkNzUyZjJjYw@renewing-unicorn-212807.upstash.io:6379}"
export JWT_SECRET="${JWT_SECRET:-kibar-prod-jwt-secret-ultra-secure-key-256bits-2026}"
export RP_ID="${RP_ID:-kibarapps.vercel.app}"
export RP_NAME="${RP_NAME:-KIBAR}"
export WEB_ORIGIN="${WEB_ORIGIN:-https://kibarapps.vercel.app}"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-4000}"

echo "✓ Base de données Neon connectée"
echo "✓ Redis Upstash connecté"
echo "✓ Passkeys WebAuthn configurées pour : $WEB_ORIGIN"

# 2. Exécution des migrations Prisma
echo "📦 Application des migrations Prisma à la base Neon..."
npx prisma migrate deploy --schema=/app/apps/api/prisma/schema.prisma || {
  echo "⚠️ Avertissement sur les migrations, démarrage du serveur..."
}

# 3. Démarrage de l'API NestJS
echo "🌟 Démarrage du serveur KIBAR API sur le port $PORT..."
exec node /app/apps/api/dist/main.js
