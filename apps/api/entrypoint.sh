#!/bin/sh
set -e

echo "[KIBAR ENTRYPOINT] Application des migrations Prisma à la base PostgreSQL..."
npx prisma migrate deploy --schema=/app/apps/api/prisma/schema.prisma || {
  echo "[KIBAR ENTRYPOINT] Avertissement: échec ou base déjà à jour, tentative de poursuite..."
}

echo "[KIBAR ENTRYPOINT] Démarrage du serveur NestJS..."
exec node /app/apps/api/dist/main.js
