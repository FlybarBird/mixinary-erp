# Mixinary ERP permissions matrix

This document records the **approved** permission policy as implemented in code
(`src/lib/permissions.ts`, project membership overrides, page/API gates, and
money redaction). Edit and re-approve before changing the policy again.

## Legend and permission order

- `Y` = allowed
- `—` = not allowed
- `Inherit` = use the user's global role default
- `Allow` / `Deny` = override the global role default
- A non-administrator must be an assigned project member before any project-page permission applies.
- Project **Viewer** = view only.
- Project **Editor** = may edit when the user's global role also allows that action.
- Project **Manager** = Editor permissions plus project-member management.
- **Administrator** bypasses project membership.

Effective page access should be:

`active user` AND `project membership/access role` AND `global role capability`

Effective money visibility should be:

`project View money override (Allow/Deny)` OR, when set to `Inherit`, `global role default`

Administrators always see money; a project `Deny` override cannot hide money
from an Administrator.

The project override belongs to the individual project member, not to the whole
project. This allows two users with the same global role to have different money
visibility on one project.

Role abbreviations:

- **Admin** = Administrator
- **PM** = Project Manager
- **Purch.** = Purchasing
- **Whse.** = Warehouse / Receiving
- **Acct.** = Accounting
- **Field** = Field / Production
- **Read** = Read-Only

## Global capabilities

| Capability | Admin | PM | Purch. | Whse. | Acct. | Field | Read | Notes |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Admin settings and users | Y | — | — | — | — | — | — | |
| View any money / `$` value | Y | Y | Y | — | Y | — | — | Global role default; overridable per user per project (`project_members.view_money`). Admin cannot be denied. |
| View financial pages | Y | Y | Y | — | Y | — | — | `canViewFinancials`. Financial pages also require effective View money. |
| Create projects | Y | Y | Y | — | — | — | — | Global role default; per-user override via `user_profiles.create_projects_override`. |
| Manage projects | Y | Y | Y | — | — | — | — | |
| Manage vendors | Y | — | Y | — | Y | — | — | Accounting approved (canvas). |
| Manage clients | Y | Y | — | — | Y | — | — | Accounting approved (canvas). |
| Manage project members | Y | * | * | * | * | * | * | `*` requires Project Manager access role on the project. |

## Project pages — view

Every `Y` below still requires project assignment for non-administrators.

| Project page | Admin | PM | Purch. | Whse. | Acct. | Field | Read | Notes |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| BOM | Y | Y | Y | Y | Y | Y | Y | Every monetary field additionally requires **View money**. |
| Labor | Y | Y | Y | Y | Y | Y | Y | Rates/totals require **View money**. |
| Procurement | Y | Y | Y | Y | Y | Y | Y | Every monetary field additionally requires **View money**. |
| Tracking | Y | Y | Y | Y | Y | Y | Y | |
| Expenses | Y | Y | Y | Y | Y | Y | — | Read-Only cannot open Expenses (canvas). Monetary fields require **View money**. |
| Change Orders | Y | Y | Y | — | Y | — | — | Financial page; also requires **View money**. |
| Billing | Y | Y | Y | — | Y | — | — | Financial page; also requires **View money**. |
| Subcontracts | Y | Y | Y | — | Y | — | — | Financial page; also requires **View money**. |
| Financial Dashboard | Y | Y | Y | — | Y | — | — | Financial page; also requires **View money**. |
| Client Documents | Y | Y | Y | — | Y | — | — | Also requires the Client Documents add-on and **View money**. |

## Project pages — edit and approve

Editing requires Project **Editor** or **Manager** access in addition to the global role below.

| Project action | Admin | PM | Purch. | Whse. | Acct. | Field | Read | Notes |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| BOM — edit | Y | Y | — | — | — | — | — | |
| Labor — edit | Y | Y | — | — | — | Y | — | |
| Labor — approve | Y | Y | — | — | — | — | — | |
| Procurement / POs — edit | Y | Y | Y | Y | — | — | — | Warehouse approved (canvas). |
| Tracking — edit shipment details | Y | Y | Y | Y | — | — | — | Warehouse approved (canvas); same helper as procurement edit. |
| Tracking — receive items | Y | Y | Y | Y | — | — | — | |
| Expenses — edit | Y | Y | — | — | Y | Y | — | |
| Expenses — approve | Y | Y | — | — | Y | — | — | |
| Change Orders — edit | Y | Y | — | — | Y | — | — | |
| Change Orders — approve | Y | Y | — | — | — | — | — | |
| Billing / invoices — edit | Y | Y | — | — | Y | — | — | |
| Billing — manage AP | Y | Y | Y | — | — | — | — | |
| Subcontracts — edit | Y | Y | Y | — | Y | — | — | Accounting approved (canvas); split from AP. |
| Financial Dashboard — edit | — | — | — | — | — | — | — | Dashboard remains read-only. Canvas had Accounting=Y / Admin=—; treated as a misconfiguration and not implemented. |
| Client Documents — create/edit/send | Y | Y | — | — | Y | — | — | Also requires the add-on and **View money**. |

## View-money permission scope

**View any money / `$` value** controls every monetary value independently from
page access. A denied user may still use an allowed page, but must not receive
or see the monetary data.

- Currency symbols, formatted dollar strings, and raw monetary numbers
- MSRP/list price, estimates, cost, unit price, quote, sale price, revenue, and budgets
- Subtotals, totals, shipping, tax, discounts, deposits, payments, and balances
- Profit, margin, markup, override percentages, and any values from which money can be inferred
- BOM, purchase orders, procurement, labor, expenses, change orders, billing, AP, subcontracts, and dashboards
- Project summary/header totals and portfolio/report totals
- Vendor bills, client invoices, customer documents, and email-generated financial content
- CSV, spreadsheet, PDF, print, QR, AI/review context, notifications, and other exports
- API, server-component, and database-query responses—not only visible UI columns
- Search results, tooltips, form defaults, hidden DOM, serialized props, and browser logs

Customer-facing documents are an explicit output exception: an authorized
sender may generate a document containing approved customer prices. A user
without **View money** must not preview, edit, export, or send a priced document.

## Override model

### Global role defaults

The **View money** and **Create projects** rows above define the defaults for
each role.

### User-level override

Each user may have `Inherit`, `Allow`, or `Deny` for **Create projects**
(`user_profiles.create_projects_override`). This cannot be a project override
because the project does not exist yet. Administrators always retain create
permission.

### Per-project member override

Each project member has a **View money** selector (`project_members.view_money`):

- `Inherit` — use the global role default.
- `Allow` — show monetary values on this project.
- `Deny` — hide monetary values on this project.

Administrators always see money; a project override may not deny them.

## Implementation status

Implemented:

- Global helpers and AP/subcontracts split in `src/lib/permissions.ts`
- Schema columns + migration `023_permission_policy.sql`
- Project membership resolution + `requireProjectApiContext` API guard
- Money redaction helpers and page/API/export gating
- Override UIs: Users → Create projects; Project members → View money
- Project Viewer cannot mutate via UI or project-scoped API routes (editor access required)

## Approved decisions

- [x] The role defaults for **View any money / `$` value** are approved.
- [x] The role defaults for **Create projects** are approved.
- [x] Per-user `Create projects` overrides are approved.
- [x] Per-project-member `View money` overrides are approved.
- [x] A project override may **not** deny an Administrator.
- [x] Page-view choices are approved (including Expenses hidden for Read-Only).
- [x] Page-edit and approval choices are approved (including Warehouse procurement/tracking edit, Accounting vendors/clients/subcontracts).
- [x] Every money-bearing export and external output must follow the permission.
- [x] Money-bearing API fields must be omitted or redacted when permission is denied.
- [x] Customer-facing priced-document exception is approved (requires View money to preview/edit/send).
- [x] Existing project Viewer enforcement gaps should be fixed.
- [x] Financial Dashboard remains read-only despite canvas `edit-dashboard` Accounting quirk.
