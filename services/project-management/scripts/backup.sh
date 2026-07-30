#!/usr/bin/env bash
set -euo pipefail
# Independent Plane stack backup (Postgres + MinIO volume).
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR:-./backups}/mixinary-pm-$STAMP"
mkdir -p "$OUT"
COMPOSE="${COMPOSE_FILE:-docker-compose.yml}"
PROJECT="${COMPOSE_PROJECT_NAME:-mixinary-pm}"

docker compose -p "$PROJECT" -f "$COMPOSE" exec -T mixinary-pm-db \
  pg_dump -U "${POSTGRES_USER:-mixinary_pm}" "${POSTGRES_DB:-mixinary_pm}" \
  | gzip > "$OUT/postgres.sql.gz"

docker run --rm -v "${PROJECT}_mixinary_pm_uploads:/data:ro" -v "$OUT:/out" alpine \
  tar czf /out/uploads.tar.gz -C /data .

echo "Backup written to $OUT"
