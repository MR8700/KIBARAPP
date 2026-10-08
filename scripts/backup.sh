#!/usr/bin/env bash
# Sauvegarde KIBAR : base PostgreSQL + stockage de fichiers (MinIO/S3). À lancer par cron (ex. chaque nuit) sur le serveur.
# Variables : DATABASE_URL, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, BACKUP_DIR (défaut ./backups), KEEP_DAYS (défaut 14),
#             BACKUP_REMOTE (optionnel, ex. "offsite/kibar-backups" : alias mc d'une copie HORS serveur, fortement recommandé).
set -euo pipefail
DIR="${BACKUP_DIR:-./backups}"; KEEP="${KEEP_DAYS:-14}"; DAY="$(date +%F)"
mkdir -p "$DIR/db" "$DIR/storage"
pg_dump --format=custom "${DATABASE_URL:?DATABASE_URL requis}" > "$DIR/db/kibar-$DAY.dump"
mc alias set kibar "${S3_ENDPOINT:?}" "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}" >/dev/null
mc mirror --overwrite --remove "kibar/${S3_BUCKET:-kibar-private}" "$DIR/storage/latest"
find "$DIR/db" -name 'kibar-*.dump' -mtime +"$KEEP" -delete
if [ -n "${BACKUP_REMOTE:-}" ]; then mc mirror --overwrite "$DIR" "$BACKUP_REMOTE"; fi
echo "Sauvegarde terminée : $DAY"
# Restauration : pg_restore -d "$DATABASE_URL" --clean "$DIR/db/kibar-AAAA-MM-JJ.dump" ; mc mirror "$DIR/storage/latest" "kibar/${S3_BUCKET:-kibar-private}"
