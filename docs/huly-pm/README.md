# Huly Project Management architecture (Mixinary)

| Path | Role |
|------|------|
| `services/project-management/` | Huly packaging (extract to `FlybarBird/project-management`) |
| `services/suite/` | Authentik + integration + shared-files Compose |
| `services/integration/` | API/event bridge to Huly |
| `services/shared-files/` | Shared Project Files service |
| ERP `src/` | App selector, OIDC bridge, outbox, labor ingest |

Pinned upstream: see `services/project-management/HULY_VERSION`.

Source: [hcengineering/platform](https://github.com/hcengineering/platform) · Deploy recipes: [huly-selfhost](https://github.com/hcengineering/huly-selfhost)

## Quick start (ops)

1. `cp services/project-management/.env.example services/project-management/.env` and set secrets
2. `./services/project-management/scripts/bootstrap-upstream.sh`
3. `docker compose -f services/project-management/docker-compose.yml --env-file services/project-management/.env up -d`
4. Configure Cloudflare Tunnel per `services/project-management/docs/CLOUDFLARE.md`
5. Start suite sidecars: `docker compose -f services/suite/docker-compose.yml --env-file services/suite/.env up -d`
6. Set ERP Authentik + `INTEGRATION_*` env vars; apply migrations `023` and `024`
