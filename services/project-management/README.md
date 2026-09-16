# Mixinary Project Management (OpenProject packaging)

Company packaging for self-hosted **[OpenProject](https://www.openproject.org)** as the suite Project Management app.

| Item | Value |
|------|--------|
| Upstream | [`openproject/openproject`](https://hub.docker.com/r/openproject/openproject) Community |
| Deploy recipe | Official Docker (Compose / all-in-one) — see [docs](https://www.openproject.org/docs/installation-and-operations/installation/docker/) |
| Pinned major | see `OPENPROJECT_VERSION` (default `17`) |
| License | GNU GPL v3 (OpenProject Community) |
| Intended extract repo | `FlybarBird/project-management` |

## Quick start

```bash
cp .env.example .env   # set SECRET_KEY_BASE and DB password
docker compose -f docker-compose.yml --env-file .env up -d
./scripts/smoke-login.sh
```

**Login:** `http://localhost:8087/project-management/login`  
Default: username `admin` / password from `OPENPROJECT_SEED__ADMIN__USER__PASSWORD` (default `admin`).  
See **[docs/LOGIN.md](./docs/LOGIN.md)** for production host/HTTPS settings and reset steps.

Public path (Cloudflare): `/project-management` → container on `LISTEN_HTTP_PORT` (default **8087**).

ERP root remains Mixinary ERP; do not redirect PM users to bare `/`.

## Relative URL root

`OPENPROJECT_RAILS__RELATIVE__URL__ROOT=/project-management` so the app lives under the suite path without rewriting every link.

## Authentication

| Mode | Community | Notes |
|------|-----------|--------|
| Password (`admin`) | Yes | Default — keep enabled |
| Authentik OIDC | Enterprise add-on | See `company/oidc/authentik.env.example` |

## API integration

Integration service talks to OpenProject **APIv3** with an API key (`apikey` basic auth). Create a key under My account → Access token in OpenProject, then set `OPENPROJECT_API_KEY` on the suite integration container.
