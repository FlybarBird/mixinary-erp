# Mixinary ERP — Deploy checklist

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run migrations in order under `supabase/migrations/` (through `010_user_system.sql`).
3. Confirm Storage bucket `quote-pdfs` exists (private).
4. Open the app once — if no users exist, **`/setup`** creates the first administrator.
5. Or create/invite users in **Admin → Users** (preferred), or invite via Supabase Auth and set the role:

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
- Optional branding: `APP_BRAND_NAME=Mixinary ERP`

### Email / SMTP (invites + notifications)

**Preferred (same as Shadow PMS): Resend**

```
RESEND_API_KEY=re_xxxxx
RESEND_FROM="Mixinary ERP <noreply@yourdomain.com>"
```

Verify the domain in the Resend dashboard. Admin → **Email** shows provider status and can send a test message.

**Fallback: app SMTP**

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`
- Used only when Resend is not configured.

**If neither is set:** Admin → Users shows a **copy invite link** (`/invite/[token]`).

**Supabase Auth emails (password reset / magic link / SSO invites in cloud mode)**  
In Supabase Dashboard → **Authentication → Emails / SMTP**:

1. Configure custom SMTP (or Supabase’s built-in).
2. Brand Auth templates (invite, magic link, reset password) with Mixinary logo/subject/from-address.
3. Add redirect URLs: `https://your-app/auth/callback`, `https://your-app/auth/reset`, `https://your-app/login`.

App-side transactional mail (user invites, project-member notices) uses Resend/SMTP above, independent of Supabase Auth templates.

### SSO + magic link

In Supabase Dashboard → **Authentication → Providers**:

1. Enable **Email** magic link / OTP.
2. Enable **Google** and **Azure (Microsoft)**; set client IDs/secrets.
3. Site URL + redirect allow-list must include `/auth/callback`.

Login UI offers password, email link, Google, and Microsoft. After first OAuth login, default role is `project_manager` unless invite metadata specifies otherwise; administrators can change roles in Admin → Users.

## 2b. Suite Project Management (optional)

Plane CE fork packaging, Authentik, integration, and shared files live under
`services/` — see [docs/plane-pm/README.md](./docs/plane-pm/README.md).

ERP env additions (also in `.env.example`):

- `NEXT_PUBLIC_PM_BASE_PATH=/project-management`
- `INTEGRATION_BASE_URL` / `INTEGRATION_WEBHOOK_SECRET`
- `AUTHENTIK_ISSUER` / `AUTHENTIK_CLIENT_ID` / `AUTHENTIK_CLIENT_SECRET`

Apply migration `023_suite_integration.sql`. Suite landing is `/apps`.

## 3. Vercel

1. Import this Git repo into Vercel.
2. Framework: Next.js (auto-detected).
3. Add env vars from above.
4. Deploy.
5. Smoke test:
   - Sign in (password / magic link / SSO)
   - Account menu → profile/password
   - Admin → Users: create, invite, deactivate, reset password
   - Create a project → Members panel → assign viewer/editor/manager
   - Admin → Excel Import with master workbook
   - BOM edit, MSRP refresh, PDF quote apply

## 4. Local development

```bash
npm install
cp .env.example .env.local
# Optional SQLite mode:
# NEXT_PUBLIC_MIXINARY_LOCAL_MODE=true
# MIXINARY_LOCAL_MODE=true
npm run dev
```

First visit with an empty user table redirects to **`/setup`**. Self-service profile is at **`/account`**.

Optional: `npx supabase start` if you use the local Supabase CLI stack, then apply migrations there.

## 5. Roles + project access

### Global roles

| Role | Can do |
|------|--------|
| administrator | Everything + users, vendors, price sources, Excel import; sees all projects |
| project_manager | Clients, projects, parts, templates, pricing, AI apply; project ACL required unless admin |
| purchasing | Procurement + project create; financials visible |
| warehouse | Receiving |
| accounting | Expenses/approvals + financials |
| field | Labor/expenses (limited) |
| read_only | View only |

Legacy `admin` / `estimator` / `tech` values are normalized to the roles above.

### Project members (`project_members`)

- Administrators bypass membership and see every project.
- Other users only see projects they are assigned to.
- Access roles: **viewer** (read-only), **editor** (edit if global role allows), **manager** (edit + manage members).
- Creating a project auto-adds the creator as **manager**.

## 6. Parts catalog enrichment (optional)

For **Enrich** on `/parts` (images/name/specs from brand+SKU or UPC):

- `ICECAT_USERNAME` / `ICECAT_PASSWORD` — Open Icecat account
- `UPCITEMDB_USER_KEY` — UPCitemdb API key (trial works at low volume)

Also run migration `004_catalog_parts.sql` and ensure Storage bucket `part-images` exists.
