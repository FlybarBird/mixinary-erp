# Native iPad ERP client

## Goal

Ship a full Mixinary ERP experience on iPad that **connects into** the existing
Next.js + Supabase cloud (same auth users, ACL, and `/api/*` surface).

## Phase 0 (this PR)

| Piece | Location |
|-------|----------|
| Bearer JWT on staff APIs | [`src/lib/supabase/request-auth.ts`](../src/lib/supabase/request-auth.ts), [`server.ts`](../src/lib/supabase/server.ts), [`auth.ts`](../src/lib/auth.ts), middleware |
| Mobile read APIs | `GET /api/me`, `GET /api/projects`, `GET /api/projects/[id]` |
| Brother QR labels | `GET /api/projects/[id]/labels`, `…/labels/pdf` — QL 62mm PDF for iPad |
| Shared domain | [`packages/domain`](../packages/domain) |
| Expo iPad shell | [`apps/ipad`](../apps/ipad) — login, projects, **Brother label print** |

## Auth contract

1. iPad signs in with Supabase JS (`signInWithPassword`)
2. App sends `Authorization: Bearer <access_token>` on every ERP API call
3. Next `createClient()` / `getCurrentProfile()` accept cookie **or** Bearer
4. Middleware does **not** redirect `/api/*` to HTML `/login`

## Printing: Brother on iPad (not DYMO)

Desktop web keeps **DYMO Connect** for LabelWriters. The iPad app targets **Brother QL** (Wi‑Fi / Bluetooth / AirPrint), which works natively on iPadOS.

| | Desktop web | iPad |
|--|-------------|------|
| Hardware | DYMO LabelWriter | Brother QL-820NWB / QL-1110NWB |
| Stock | 1.8″ × 3.1″ DYMO | 62mm continuous (`RollW62`), ~46mm cut |
| Path | DYMO JS framework | Label PDF → Brother SDK or AirPrint |

Optional native SDK: add `expo-brother-printer-sdk` and run `npx expo prebuild` for direct Bluetooth/Wi‑Fi print. Without it, **Print on Brother** opens the iOS print sheet (AirPrint) or share sheet (Brother iPrint&Label).

## Later phases

1. Receive / QR scan, labor, expenses, tracking
2. BOM + procurement editors (tablet UX)
3. Billing, client documents, financial dashboard
4. Catalog, AI review, admin parity; push notifications

See [`apps/ipad/README.md`](../apps/ipad/README.md) for run instructions.

