#!/usr/bin/env bash
# ==============================================================================
# scripts/deploy/backup.sh
# Sauvegarde quotidienne KIBAR : dump PostgreSQL chiffré + miroir de stockage R2/S3
# Rétention 14 jours + réplication vers bucket secondaire
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.deploy.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DAY="$(date +%F)"

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/storage"

echo "================================================================="
echo "  📦 Sauvegarde Production KIBAR - $TIMESTAMP"
echo "================================================================="

# 1. Export PostgreSQL chiffré (DUMP + AES-256-CBC)
echo "💾 Export de la base PostgreSQL..."
if [ -n "${DIRECT_URL:-}" ] || [ -n "${DATABASE_URL:-}" ]; then
  DB_URL="${DIRECT_URL:-$DATABASE_URL}"
  BACKUP_PASS="${BACKUP_ENCRYPTION_KEY:-kibar-backup-master-key}"

  # Dump au format custom, puis chiffrement à la volée
  pg_dump --format=custom "$DB_URL" | \
    openssl enc -aes-256-cbc -salt -pbkdf2 -pass "pass:$BACKUP_PASS" \
    -out "$BACKUP_DIR/db/kibar-${TIMESTAMP}.dump.enc"

  echo "✓ Base de données sauvegardée et chiffrée avec succès."
else
  echo "⚠️ Aucune URL de base de données spécifiée pour pg_dump."
fi

# 2. Miroir du stockage de fichiers (R2 / S3)
echo "📁 Synchronisation du stockage de fichiers..."
if command -v mc >/dev/null 2>&1 && [ -n "${S3_ENDPOINT:-}" ]; then
  mc alias set kibar-src "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
  mc mirror --overwrite --remove "kibar-src/${S3_BUCKET:-kibar-private-prod}" "$BACKUP_DIR/storage/latest"
  echo "✓ Stockage miroir synchronisé."

  # Réplication vers un second bucket hors-site si configuré
  if [ -n "${BACKUP_REMOTE:-}" ]; then
    echo "☁️ Copie vers le bucket distant secondaire ($BACKUP_REMOTE)..."
    mc mirror --overwrite "$BACKUP_DIR" "$BACKUP_REMOTE"
    echo "✓ Copie distante effectuée."
  fi
fi

# 3. Purge des sauvegardes locales de plus de 14 jours
echo "🧹 Purge des archives locales dépassant $KEEP_DAYS jours..."
find "$BACKUP_DIR/db" -name 'kibar-*.dump.enc' -mtime +"$KEEP_DAYS" -delete || true

echo "================================================================="
echo "✅ Sauvegarde terminée avec succès pour le $DAY."
echo "================================================================="
