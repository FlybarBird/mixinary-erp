# Mixinary ERP

Web-based multi-user ERP for Mixinary AVL installs. Replaces the master project-number workbook with:

- Project BOMs (sections, line items, vendors, order status, tracking)
- Sheet-equivalent pricing (MSRP / Quote / % override / Sale / Out of pocket)
- Clients, vendors, project templates
- Ops dashboard + role-based access (7 roles) and per-project membership
- Admin user lifecycle: create/invite, deactivate, password reset, audit
- Self-service **/account**; magic link + Google/Microsoft SSO (Supabase)
- AI MSRP refresh from an allowlisted set of websites (review before apply)
- AI PDF quote upload → match lines → update project quotes (review before apply)
- Excel import for the existing master workbook

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, RLS, Storage) **or** local SQLite (`MIXINARY_LOCAL_MODE`)
- OpenAI for structured extraction
- Optional SMTP (`nodemailer`) **or Resend** for invites and project notifications
- Suite Project Management: Huly packaging under `services/project-management/` (see [docs/huly-pm/README.md](./docs/huly-pm/README.md))

## Brand

Mixinary logos from the shared Logo Package live in `public/brand/`.

## Quick start

See [DEPLOY.md](./DEPLOY.md) for Supabase + Vercel, SMTP branding, SSO, and project ACLs.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Empty databases open **`/setup`** to create the first administrator. Manage users under **Admin → Users**. Assign project access from each project’s **Members** panel.

## Scripts

- `npm run dev` — local app
- `npm run build` — production build
- `npm test` — pricing formula unit tests
