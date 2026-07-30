# Mixinary ERP — iPad (Expo)

Native iPad client that signs into the same Supabase Auth project and calls the
Next.js ERP APIs with `Authorization: Bearer <access_token>`.

## Prerequisites

1. Running Mixinary web/API (this repo) with Supabase configured
2. Expo Go on an iPad, or Xcode for a native build (macOS)

## Configure

Create `apps/ipad/.env` (or export env vars):

```bash
EXPO_PUBLIC_API_URL=https://your-erp.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

For local API + physical iPad, use your machine LAN IP, not `localhost`
(e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:3000`).

## Run

```bash
cd apps/ipad
npm start
```

Then open in Expo Go (iPad) or press `i` for the iOS simulator on macOS.

## What this phase includes

- Supabase email/password sign-in (JWT session)
- `GET /api/me` profile + capability flags
- `GET /api/projects` list (ACL-aware)
- `GET /api/projects/[id]` detail

## Shared domain

Role checks and pricing formulas live in [`packages/domain`](../../packages/domain).
