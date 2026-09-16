# OpenProject login (Mixinary suite)

Community Edition supports **password login** out of the box. OpenID Connect
(Authentik) is an **Enterprise add-on** — do not rely on it for Community.

## First boot (local)

```bash
cd services/project-management
cp .env.example .env
# set SECRET_KEY_BASE + OPENPROJECT_DB_PASSWORD
openssl rand -hex 64   # paste into SECRET_KEY_BASE
docker compose --env-file .env up -d
./scripts/smoke-login.sh
```

Open:

```
http://localhost:8087/project-management/login
```

Default credentials (first seed only):

| Field | Value |
|-------|--------|
| Username | `admin` |
| Password | value of `OPENPROJECT_SEED__ADMIN__USER__PASSWORD` (default `admin`) |

With `OPENPROJECT_SEED__ADMIN__USER__PASSWORD__RESET=true` (default), OpenProject
forces a password change on first login — set a vaulted password immediately.

## Production (Cloudflare `/project-management`)

1. Set `OPENPROJECT_HOST__NAME` to the public hostname (no scheme), e.g. `erp.example.com`
2. Set `OPENPROJECT_HTTPS=true`
3. Keep `APP_BASE_PATH=/project-management`
4. Tunnel path `/project-management*` → `http://127.0.0.1:8087` (preserve path)
5. Login URL: `https://<host>/project-management/login`

## Checklist if login fails

- [ ] Hitting `/project-management/login` (not bare `/login` when relative root is set)
- [ ] `OPENPROJECT_HOST__NAME` matches the Host header users send
- [ ] `OPENPROJECT_HTTPS` matches TLS termination (true behind Cloudflare HTTPS)
- [ ] `OPENPROJECT_DISABLE__PASSWORD__LOGIN` is `false`
- [ ] `OPENPROJECT_SEED__ADMIN__USER__LOCKED` is `false`
- [ ] Container healthy: `docker compose ps` / `./scripts/smoke-login.sh`
- [ ] First-boot seed only — password env changes after seed do **not** update the DB

Reset admin password (break-glass):

```bash
docker exec -it mixinary-pm-web bash -lc \
  'cd /app && bundle exec rails runner "u=User.find_by_login!(\"admin\"); u.password=u.password_confirmation=\"NEW_PASSWORD\"; u.force_password_change=false; u.save!"'
```

## Authentik / OIDC

See `company/oidc/authentik.env.example`. Requires OpenProject Enterprise.
Until then, use password login (or LDAP if configured separately).
