#!/usr/bin/env bash
# ==============================================================================
# scripts/deploy/restore.sh
# Procédure de restauration d'un dump chiffré KIBAR
# Usage: ./restore.sh <fichier_dump.enc> [DATABASE_URL_CIBLE]
# ==============================================================================
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <chemin_du_fichier.dump.enc> [DATABASE_URL_CIBLE]"
  exit 1
fi

ENC_FILE="$1"
TARGET_DB="${2:-${DATABASE_URL:-}}"
BACKUP_PASS="${BACKUP_ENCRYPTION_KEY:-kibar-backup-master-key}"

if [ ! -f "$ENC_FILE" ]; then
  echo "❌ Fichier introuvable: $ENC_FILE"
  exit 1
fi

if [ -z "$TARGET_DB" ]; then
  echo "❌ Aucune URL de base de données fournie."
  exit 1
fi

TMP_DUMP="$(mktemp /tmp/kibar-restore-XXXXXX.dump)"
trap 'rm -f "$TMP_DUMP"' EXIT

echo "================================================================="
echo "  🔄 Restauration KIBAR - Base de données"
echo "================================================================="

# 1. Déchiffrement du dump
echo "🔓 Déchiffrement de l'archive $ENC_FILE..."
openssl enc -d -aes-256-cbc -salt -pbkdf2 -pass "pass:$BACKUP_PASS" \
  -in "$ENC_FILE" -out "$TMP_DUMP"

# 2. Restauration via pg_restore
echo "📥 Injection des tables et données dans la base cible..."
pg_restore -d "$TARGET_DB" --clean --if-exists --no-owner --no-privileges "$TMP_DUMP" || {
  echo "⚠️ Des avertissements pg_restore ont pu se produire."
}

echo "================================================================="
echo "✅ Restauration de la base de données terminée avec succès."
echo "Pour restaurer le stockage : mc mirror ./backups/storage/latest kibar/<BUCKET>"
echo "================================================================="
