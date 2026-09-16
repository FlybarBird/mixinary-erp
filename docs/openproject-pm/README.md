# OpenProject Project Management architecture (Mixinary)

| Path | Role |
|------|------|
| `services/project-management/` | OpenProject packaging (extract to `FlybarBird/project-management`) |
| `services/suite/` | Authentik + integration + shared-files Compose |
| `services/integration/` | API/event bridge to OpenProject APIv3 |
| `services/shared-files/` | Shared Project Files service |
| ERP `src/` | App selector, OIDC bridge, outbox, labor ingest |

Pinned upstream: see `services/project-management/OPENPROJECT_VERSION`.

Upstream: [openproject/openproject](https://github.com/opf/openproject) · Docs: [openproject.org](https://www.openproject.org/docs/)

## Quick start (ops)

1. `cp services/project-management/.env.example services/project-management/.env` and set `SECRET_KEY_BASE` + DB password
2. `docker compose -f services/project-management/docker-compose.yml --env-file services/project-management/.env up -d`
3. Configure Cloudflare Tunnel per `services/project-management/docs/CLOUDFLARE.md`
4. Start suite sidecars: `docker compose -f services/suite/docker-compose.yml --env-file services/suite/.env up -d`
5. Create an OpenProject API token (My account → Access token) and set `OPENPROJECT_API_KEY` on the integration service
6. Set ERP Authentik + `INTEGRATION_*` env vars; apply migrations `023`, `024`, and `028`
7. Confirm PM login at `/project-management/login` (Community: `admin` password — see `services/project-management/docs/LOGIN.md`)
