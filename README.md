# Mixinary ERP

Web-based multi-user ERP for Mixinary AVL installs. Replaces the master project-number workbook with:

- Project BOMs (sections, line items, vendors, order status, tracking)
- Sheet-equivalent pricing (MSRP / Quote / % override / Sale / Out of pocket)
- Clients, vendors, project templates
- Ops dashboard + role-based access (`admin` / `estimator` / `tech`)
- AI MSRP refresh from an allowlisted set of websites (review before apply)
- AI PDF quote upload → match lines → update project quotes (review before apply)
- Excel import for the existing master workbook

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, RLS, Storage)
- OpenAI for structured extraction

## Brand

Mixinary logos from the shared Logo Package live in `public/brand/` (dark UI with cyan accent).

## Quick start

See [DEPLOY.md](./DEPLOY.md) for Supabase + Vercel setup.

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Scripts

- `npm run dev` — local app
- `npm run build` — production build
- `npm test` — pricing formula unit tests
