# Emergency OpenProject administrator

Keep a local OpenProject `admin` account for recovery if Authentik is unavailable.

1. First boot creates `admin` / `admin` — change the password immediately.
2. Prefer Authentik OIDC for day-to-day access; keep admin for break-glass only.
3. Document the password in the company secrets vault (not git).
