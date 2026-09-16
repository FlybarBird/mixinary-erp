# Emergency OpenProject administrator

Keep a local OpenProject `admin` account for recovery (required on Community; also useful if Authentik/OIDC is unavailable).

1. First boot seeds `admin` with `OPENPROJECT_SEED__ADMIN__USER__PASSWORD` (default `admin`).
2. With password-reset seeding enabled, change the password on first login and store it in the company vault (not git).
3. Prefer day-to-day SSO only after Enterprise OIDC is configured and verified; never set `OPENPROJECT_DISABLE__PASSWORD__LOGIN=true` until break-glass password access is confirmed.
4. Reset procedure: see `docs/LOGIN.md`.
