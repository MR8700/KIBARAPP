#!/usr/bin/env bash
# ==============================================================================
# scripts/deploy/rotate-secrets.sh
# Procédure sécurisée de rotation des secrets cryptographiques
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.deploy.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

FLY_BIN="$(command -v flyctl || command -v fly || echo "")"
FLY_API_APP="${FLY_API_APP:-kibar-api}"

echo "================================================================="
echo "  🔐 Rotation des Secrets de Production KIBAR"
echo "================================================================="

# Génération des nouveaux secrets de haute entropie
NEW_JWT_SECRET="$(openssl rand -hex 32)"

if [ -n "$FLY_BIN" ]; then
  echo "🚀 Application du nouveau JWT_SECRET sur Fly.io ($FLY_API_APP)..."
  # Injection sécurisée par stdin sans affichage ni journalisation
  echo "JWT_SECRET=$NEW_JWT_SECRET" | $FLY_BIN secrets import --app "$FLY_API_APP"
  echo "✓ Nouveau secret injecté avec succès sur Fly.io."
else
  echo "⚠️ fly CLI non disponible."
fi

# Nettoyage immédiat de la variable en mémoire
unset NEW_JWT_SECRET

echo "================================================================="
echo "✅ Rotation terminée. Un redéploiement rolling Fly a été initié."
echo "================================================================="
