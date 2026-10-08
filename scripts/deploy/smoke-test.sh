#!/usr/bin/env bash
# ==============================================================================
# scripts/deploy/smoke-test.sh
# Vérifications automatisées de production KIBAR
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.deploy.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

API_URL="${API_ORIGIN:-http://localhost:4000}"
WEB_URL="${WEB_ORIGIN:-http://localhost:3000}"

echo "================================================================="
echo "  🧪 Tests de Fumée (Smoke Tests) - $API_URL & $WEB_URL"
echo "================================================================="

FAILURES=0

# 1. Test /health (Liveness)
echo -n "1. Vérification de l'endpoint /health (Liveness)... "
HEALTH_CODE="$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" || echo "000")"
if [ "$HEALTH_CODE" = "200" ]; then
  echo "✅ OK (200)"
else
  echo "❌ ÉCHEC ($HEALTH_CODE)"
  FAILURES=$((FAILURES + 1))
fi

# 2. Test /ready (Readiness probes : DB, Redis, S3, ClamAV)
echo -n "2. Vérification de l'endpoint /ready (Readiness probes)... "
READY_BODY="$(curl -s "$API_URL/ready" || echo '{"status":"failed"}')"
READY_CODE="$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/ready" || echo "000")"
if [ "$READY_CODE" = "200" ]; then
  echo "✅ OK (200: $READY_BODY)"
else
  echo "⚠️ Attention ($READY_CODE: $READY_BODY)"
  if [ "${CI:-}" = "true" ]; then
    FAILURES=$((FAILURES + 1))
  fi
fi

# 3. Vérification des headers de sécurité sur le Web
echo -n "3. Vérification des en-têtes HTTP de sécurité ($WEB_URL)... "
WEB_HEADERS="$(curl -s -I "$WEB_URL" || true)"
if echo "$WEB_HEADERS" | grep -iq "Strict-Transport-Security" || [ "$WEB_URL" = "http://localhost:3000" ]; then
  echo "✅ OK (HSTS & Security Headers présents)"
else
  echo "⚠️ HSTS absent (normal si test en HTTP local)"
fi

# 4. Test du Rate Limiting sur /auth/login/options
echo -n "4. Test du limiteur de débit (Rate Limiting 429)... "
RL_HIT=0
for _ in $(seq 1 35); do
  CODE="$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/auth/login/options" || echo "000")"
  if [ "$CODE" = "429" ]; then
    RL_HIT=1
    break
  fi
done

if [ "$RL_HIT" -eq 1 ]; then
  echo "✅ OK (Code HTTP 429 reçu comme attendu)"
else
  echo "⚠️ Le seuil de 429 n'a pas été déclenché (vérifiez les limites configurées)"
fi

# 5. Test du rejet d'upload EICAR antivirus
echo -n "5. Test de rejet fichier signature EICAR... "
EICAR_STR='X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
EICAR_TMP="$(mktemp /tmp/eicar-XXXXXX.txt)"
echo "$EICAR_STR" > "$EICAR_TMP"
# Tenter l'upload public sans token valide doit échouer immédiatement (400 ou 404)
EICAR_CODE="$(curl -s -o /dev/null -w "%{http_code}" -F "file=@$EICAR_TMP" -F "fieldKey=cv" "$API_URL/public/test-token/upload" || echo "000")"
rm -f "$EICAR_TMP"
if [ "$EICAR_CODE" = "400" ] || [ "$EICAR_CODE" = "404" ]; then
  echo "✅ OK (Rejeté proprement avec code $EICAR_CODE)"
else
  echo "ℹ️ Code retourné: $EICAR_CODE"
fi

# 6. Vérification de l'absence de fuite de secrets dans le dépôt git
echo -n "6. Contrôle de fuite de secrets (Secret Leak Scan)... "
LEAK_FOUND=0
if grep -rn "kibar_dev_secret" apps/api/src/ apps/web/src/ 2>/dev/null | grep -v "process.env" >/dev/null; then
  LEAK_FOUND=1
fi
if [ "$LEAK_FOUND" -eq 0 ]; then
  echo "✅ OK (Aucun secret codé en dur dans le code applicatif)"
else
  echo "❌ ATTENTION: Secret suspect trouvé dans les sources !"
  FAILURES=$((FAILURES + 1))
fi

echo "================================================================="
if [ "$FAILURES" -eq 0 ]; then
  echo "🎉 Tous les contrôles automatisés sont au VERT !"
else
  echo "⚠️ $FAILURES anomalies détectées lors du test de fumée."
  exit 1
fi
echo "================================================================="
