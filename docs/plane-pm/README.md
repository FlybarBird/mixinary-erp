# Plane Project Management architecture (Mixinary)

This repository contains:

| Path | Role |
|------|------|
| `services/project-management/` | Company Plane CE fork packaging (extract to `FlybarBird/project-management`) |
| `services/suite/` | Authentik + integration + shared-files Compose |
| `services/integration/` | API/event bridge (no shared DB with ERP or Plane app DB writes from ERP) |
| `services/shared-files/` | Shared Project Files service |
| ERP `src/` | Suite landing, app selector, OIDC bridge, outbox, labor ingest |

Pinned upstream: see `services/project-management/PLANE_VERSION`.

## Quick start (ops)

1. Copy `services/project-management/.env.example` → `.env` and set secrets.
2. `docker compose -f services/project-management/docker-compose.yml up -d`
3. Copy `services/suite/.env.example` → `.env` and `docker compose -f services/suite/docker-compose.yml up -d`
4. Configure Cloudflare Tunnel per `services/project-management/docs/CLOUDFLARE.md`
5. Set ERP env vars from `.env.example` (Authentik + `INTEGRATION_*`)
6. Run Supabase migration `023_suite_integration.sql`
