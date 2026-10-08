#!/usr/bin/env bash
# ==============================================================================
# scripts/deploy/provision.sh
# Provisionnement automatisé, idempotent et sécurisé de l'infrastructure KIBAR
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.deploy.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Fichier de configuration manquant : $ENV_FILE"
  echo "Créez-le à partir de $SCRIPT_DIR/.deploy.env.example avant de lancer ce script."
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

echo "================================================================="
echo "  KIBAR - Provisionnement de Production : $DOMAINE"
echo "  Web : $WEB_ORIGIN | API : $API_ORIGIN"
echo "  Région : $REGION | E-mail alerte : $ALERT_EMAIL"
echo "================================================================="

# 1. Vérification des outils CLI requis
echo "🔍 Vérification des outils CLI..."
command -v openssl >/dev/null 2>&1 || { echo "❌ openssl est requis"; exit 1; }
FLY_BIN="$(command -v flyctl || command -v fly || echo "")"
if [ -z "$FLY_BIN" ]; then
  echo "⚠️ fly / flyctl non trouvé dans le PATH. Installation requise pour déployer l'API."
fi
command -v vercel >/dev/null 2>&1 || echo "⚠️ vercel CLI non trouvé dans le PATH."
command -v neonctl >/dev/null 2>&1 || echo "ℹ️ neonctl CLI non trouvé (fallback manuel possible)."
command -v wrangler >/dev/null 2>&1 || echo "ℹ️ wrangler CLI non trouvé (fallback manuel possible)."

# 2. Génération des secrets cryptographiques forts (non journalisés, non affichés)
echo "🔐 Génération des secrets sécurisés (OpenSSL 256 bits)..."
JWT_SECRET="$(openssl rand -hex 32)"
BACKUP_ENCRYPTION_KEY="$(openssl rand -hex 32)"

# 3. Provisionnement Fly.io (ClamAV & API)
if [ -n "$FLY_BIN" ]; then
  echo "🚀 Configuration Fly.io..."

  # a) ClamAV privé
  if ! $FLY_BIN apps list | grep -q "$FLY_CLAMD_APP"; then
    echo "  -> Création de l'application ClamAV privée : $FLY_CLAMD_APP"
    $FLY_BIN apps create "$FLY_CLAMD_APP" --org personal || true
  else
    echo "  ✓ Application $FLY_CLAMD_APP déjà existante."
  fi

  # Volume persistant ClamAV pour les signatures
  if ! $FLY_BIN volumes list -a "$FLY_CLAMD_APP" | grep -q "clamdb"; then
    echo "  -> Création du volume persistant clamdb (5 Go)..."
    $FLY_BIN volumes create clamdb --app "$FLY_CLAMD_APP" --region "$REGION" --size 5 --yes || true
  else
    echo "  ✓ Volume clamdb déjà existant."
  fi

  # b) API Publique
  if ! $FLY_BIN apps list | grep -q "$FLY_API_APP"; then
    echo "  -> Création de l'application API : $FLY_API_APP"
    $FLY_BIN apps create "$FLY_API_APP" --org personal || true
  else
    echo "  ✓ Application $FLY_API_APP déjà existante."
  fi

  # Allocation de 2 instances minimum (haute disponibilité & multi-instances)
  echo "  -> Configuration du scaling (≥ 2 instances)..."
  $FLY_BIN scale count 2 --app "$FLY_API_APP" --yes || true

  # Certificat TLS et domaine Fly
  echo "  -> Configuration du domaine $API_ORIGIN sur Fly.io..."
  API_HOST="${API_ORIGIN#https://}"
  $FLY_BIN certs add "$API_HOST" --app "$FLY_API_APP" || true
fi

# 4. Provisionnement Vercel (Web Next.js)
if command -v vercel >/dev/null 2>&1; then
  echo "▲ Configuration Vercel..."
  # Lier ou créer le projet
  (
    cd "$SCRIPT_DIR/../../apps/web"
    vercel link --yes || true
    echo "  -> Configuration des domaines..."
    WEB_HOST="${WEB_ORIGIN#https://}"
    vercel domains add "$WEB_HOST" || true
  )
fi

echo "================================================================="
echo "✅ Étape de provisionnement terminée avec succès."
echo "Pensez à injecter vos chaînes de connexion (DATABASE_URL, REDIS_URL, R2)"
echo "directement via 'fly secrets set' et 'vercel env add'."
echo "================================================================="
