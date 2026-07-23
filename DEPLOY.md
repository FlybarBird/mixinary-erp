# Mixinary ERP — Deploy checklist

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_seed_carriers.sql`
   - `supabase/migrations/003_storage_quote_pdfs.sql`
3. Confirm Storage bucket `quote-pdfs` exists (private).
4. Open the app once — if no users exist, **`/setup`** creates the first administrator.
5. Or invite a user in **Authentication → Users**, then set the role:

```sql
update public.user_profiles
set role = 'administrator'
where email = 'you@mixinary.com';
```

## 2. Environment variables

Copy `.env.example` to `.env.local` (local) and set the same values in Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose to the client)
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_APP_URL` (e.g. `https://erp.mixinary.com`)

## 3. Vercel

1. Import this Git repo into Vercel.
2. Framework: Next.js (auto-detected).
3. Add env vars from above.
4. Deploy.
5. Smoke test:
   - Sign in
   - Admin → Excel Import with `2026 MASTER Project Numbers.xlsx`
   - Open a project BOM, edit a line, save
   - Select a line → Refresh MSRP → review → apply
   - Upload a vendor PDF quote → review → apply
   - Invite a second user and set role to `tech` / `estimator`

## 4. Local development

```bash
npm install
cp .env.example .env.local
# fill keys
npm run dev
```

Optional: `npx supabase start` if you use the local Supabase CLI stack, then apply migrations there.

## 5. Roles reminder

| Role | Can do |
|------|--------|
| admin | Everything + users, vendors, price sources, Excel import |
| estimator | Clients, projects, parts catalog, templates, pricing, AI MSRP/PDF apply |
| tech | View projects/parts; update status / tracking / notes only |

## 6. Parts catalog enrichment (optional)

For **Enrich** on `/parts` (images/name/specs from brand+SKU or UPC):

- `ICECAT_USERNAME` / `ICECAT_PASSWORD` — Open Icecat account
- `UPCITEMDB_USER_KEY` — UPCitemdb API key (trial works at low volume)

Also run migration `004_catalog_parts.sql` and ensure Storage bucket `part-images` exists.
