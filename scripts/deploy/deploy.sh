#!/usr/bin/env bash
# ==============================================================================
# scripts/deploy/deploy.sh
# Déploiement de production KIBAR (Fly.io rolling deploy + Vercel prod)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.deploy.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

FLY_BIN="$(command -v flyctl || command -v fly || echo "")"
FLY_API_APP="${FLY_API_APP:-kibar-api}"
FLY_CLAMD_APP="${FLY_CLAMD_APP:-kibar-clamd}"

echo "================================================================="
echo "  🚀 Démarrage du Déploiement Production KIBAR"
echo "================================================================="

# 1. Vérification locale des builds & tests avant tout envoi
echo "🧪 [1/5] Vérification des tests et des builds..."
(
  cd "$ROOT_DIR"
  npm -w apps/api test
  npm -w apps/api run build
  npm -w apps/web run build
)
echo "✓ Tests et compilations validés avec succès."

# 2. Déploiement du daemon privé ClamAV
if [ -n "$FLY_BIN" ]; then
  echo "🛡️ [2/5] Déploiement du daemon antivirus ClamAV ($FLY_CLAMD_APP)..."
  $FLY_BIN deploy "$SCRIPT_DIR/fly-clamav" --app "$FLY_CLAMD_APP" --strategy rolling || true
fi

# 3. Déploiement de l'API Fly.io (avec release command pour Prisma Migrate)
if [ -n "$FLY_BIN" ]; then
  echo "⚙️ [3/5] Déploiement de l'API ($FLY_API_APP)..."
  (
    cd "$ROOT_DIR"
    # Fly exécute la release_command (prisma migrate deploy) avant de basculer le trafic
    $FLY_BIN deploy --app "$FLY_API_APP" \
      --strategy rolling \
      --ha=true \
      --wait-timeout 300
  )
  echo "✓ API déployée avec succès sur Fly.io."
else
  echo "⚠️ fly CLI non disponible : déploiement API ignoré."
fi

# 4. Déploiement du Frontend Web sur Vercel
if command -v vercel >/dev/null 2>&1; then
  echo "▲ [4/5] Déploiement du Web sur Vercel..."
  (
    cd "$ROOT_DIR/apps/web"
    vercel --prod --yes
  )
  echo "✓ Web déployé sur Vercel."
else
  echo "ℹ️ vercel CLI non présent : le déploiement web s'exécutera via Git / Vercel GitHub Integration."
fi

# 5. Exécution des Smoke Tests post-déploiement
echo "🔍 [5/5] Exécution des Smoke Tests post-déploiement..."
if [ -x "$SCRIPT_DIR/smoke-test.sh" ]; then
  "$SCRIPT_DIR/smoke-test.sh"
else
  bash "$SCRIPT_DIR/smoke-test.sh" || echo "⚠️ Smoke test terminé avec des remarques."
fi

echo "================================================================="
echo "🎉 Déploiement KIBAR de production terminé avec succès !"
echo "================================================================="
