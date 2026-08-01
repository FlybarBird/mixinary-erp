# Mixinary Project Management (Huly packaging)

Company packaging for self-hosted **Huly** as the suite Project Management app.

| Item | Value |
|------|--------|
| Upstream source | [`hcengineering/platform`](https://github.com/hcengineering/platform) |
| Deploy recipe | Adapted from [`hcengineering/huly-selfhost`](https://github.com/hcengineering/huly-selfhost) |
| Pinned version | see `HULY_VERSION` |
| License | Eclipse Public License 2.0 (EPL-2.0) |
| Intended repo | `FlybarBird/project-management` |

## Remotes (after extraction)

```bash
git remote add origin git@github.com:FlybarBird/project-management.git
git remote add upstream https://github.com/hcengineering/platform.git
git remote add selfhost-upstream https://github.com/hcengineering/huly-selfhost.git
```

## Quick start

```bash
cp .env.example .env   # set secrets
./scripts/bootstrap-upstream.sh
docker compose -f docker-compose.yml --env-file .env up -d
```

Public path (Cloudflare): `/project-management` → nginx on `LISTEN_HTTP_PORT` (default 8087).

ERP root remains Mixinary ERP; do not redirect PM users to bare `/`.
