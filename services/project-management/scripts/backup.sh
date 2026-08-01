#!/usr/bin/env bash
set -euo pipefail
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR:-./backups}/mixinary-pm-$STAMP"
mkdir -p "$OUT"
PROJECT="${COMPOSE_PROJECT_NAME:-mixinary-pm}"
COMPOSE="${COMPOSE_FILE:-docker-compose.yml}"

echo "Backing up Cockroach + MinIO for $PROJECT → $OUT"
docker compose -p "$PROJECT" -f "$COMPOSE" exec -T cockroach \
  ./cockroach dump "${CR_DATABASE:-mixinary_pm}" --insecure 2>/dev/null \
  | gzip > "$OUT/cockroach.sql.gz" || echo "cockroach dump skipped (check auth flags for your version)"

docker run --rm -v "${PROJECT}_files:/data:ro" -v "$OUT:/out" alpine \
  tar czf /out/files.tar.gz -C /data . || true

echo "Backup written to $OUT"
