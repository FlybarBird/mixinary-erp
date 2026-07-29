# Mixinary ERP permissions matrix

Edit this file directly, replacing `Y` (allowed) and `—` (not allowed). Add comments in the **Notes / requested change** column, then hand the file back to the agent.

## Legend and permission order

- `Y` = allowed
- `—` = not allowed
- `Inherit` = use the user's global role default
- `Allow` / `Deny` = override the global role default for one user on one project
- `NEW` = proposed permission that is not yet implemented as a distinct code check
- A non-administrator must be an assigned project member before any project-page permission applies.
- Project **Viewer** = view only.
- Project **Editor** = may edit when the user's global role also allows that action.
- Project **Manager** = Editor permissions plus project-member management.
- **Administrator** bypasses project membership.

Effective page access should be:

`active user` AND `project membership/access role` AND `global role capability`

Effective money visibility should be:

`project View money override (Allow/Deny)` OR, when set to `Inherit`, `global role default`

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

| Capability | Admin | PM | Purch. | Whse. | Acct. | Field | Read | Notes / requested change |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Admin settings and users | Y | — | — | — | — | — | — | |
| View any money / `$` value **(NEW)** | Y | Y | Y | — | Y | — | — | Global role default; overridable per user per project. |
| View financial pages | Y | Y | Y | — | Y | — | — | Existing `canViewFinancials`. |
| Create projects **(NEW)** | Y | Y | Y | — | — | — | — | Global role default; should also support a per-user override. |
| Manage projects | Y | Y | Y | — | — | — | — | |
| Manage vendors | Y | — | Y | — | — | — | — | |
| Manage clients | Y | Y | — | — | — | — | — | |
| Manage project members | Y | * | * | * | * | * | * | `*` requires Project Manager access role; global role is not currently checked. |

## Project pages — view

Every `Y` below still requires project assignment for non-administrators.

| Project page | Admin | PM | Purch. | Whse. | Acct. | Field | Read | Notes / requested change |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| BOM | Y | Y | Y | Y | Y | Y | Y | Every monetary field additionally requires **View money**. |
| Labor | Y | Y | Y | Y | Y | Y | Y | Labor rates are currently hidden without financial access. |
| Procurement | Y | Y | Y | Y | Y | Y | Y | Every monetary field additionally requires **View money**. |
| Tracking | Y | Y | Y | Y | Y | Y | Y | |
| Expenses | Y | Y | Y | Y | Y | Y | Y | Every monetary field additionally requires **View money**. |
| Change Orders | Y | Y | Y | — | Y | — | — | Financial page. |
| Billing | Y | Y | Y | — | Y | — | — | Financial page. |
| Subcontracts | Y | Y | Y | — | Y | — | — | Financial page. |
| Financial Dashboard | Y | Y | Y | — | Y | — | — | Financial page; all values are costs/revenue. |
| Client Documents | Y | Y | Y | — | Y | — | — | Also requires the Client Documents add-on. |

## Project pages — edit and approve

Editing should require Project **Editor** or **Manager** access in addition to the global role below.

| Project action | Admin | PM | Purch. | Whse. | Acct. | Field | Read | Notes / requested change |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| BOM — edit | Y | Y | — | — | — | — | — | |
| Labor — edit | Y | Y | — | — | — | Y | — | |
| Labor — approve | Y | Y | — | — | — | — | — | |
| Procurement / POs — edit | Y | Y | Y | — | — | — | — | |
| Tracking — edit shipment details | Y | Y | Y | — | — | — | — | |
| Tracking — receive items | Y | Y | Y | Y | — | — | — | |
| Expenses — edit | Y | Y | — | — | Y | Y | — | |
| Expenses — approve | Y | Y | — | — | Y | — | — | |
| Change Orders — edit | Y | Y | — | — | Y | — | — | |
| Change Orders — approve | Y | Y | — | — | — | — | — | |
| Billing / invoices — edit | Y | Y | — | — | Y | — | — | |
| Billing — manage AP | Y | Y | Y | — | — | — | — | |
| Subcontracts — edit | Y | Y | Y | — | — | — | — | |
| Financial Dashboard — edit | — | — | — | — | — | — | — | Dashboard is read-only. |
| Client Documents — create/edit/send | Y | Y | — | — | Y | — | — | Also requires the add-on. |

## View-money permission scope

When **View any money / `$` value** is implemented, it controls every monetary
value independently from page access. A denied user may still use an allowed
page, but must not receive or see the monetary data.

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

Each user may have `Inherit`, `Allow`, or `Deny` for **Create projects**. This
cannot be a project override because the project does not exist yet.

### Per-project member override

Each project member has a **View money** selector:

- `Inherit` — use the global role default.
- `Allow` — show monetary values on this project.
- `Deny` — hide monetary values on this project.

Administrators default to `Allow`. Decide whether administrators may be denied
money visibility on an individual project before implementation.

## Implementation audit note

The code currently has global role helpers in `src/lib/permissions.ts` and project membership helpers in `src/lib/project-access.ts`. The BOM combines both checks, but several other project pages currently pass only the global role check to their editor component. Before treating this document as enforced policy, those pages and their API routes should be aligned so Project **Viewer** cannot mutate data through the UI or direct API calls.

## Decisions for the next implementation pass

- [ ] The role defaults for **View any money / `$` value** are approved.
- [ ] The role defaults for **Create projects** are approved.
- [ ] Per-user `Create projects` overrides are approved.
- [ ] Per-project-member `View money` overrides are approved.
- [ ] Decide whether a project override may deny an Administrator.
- [ ] Page-view choices are approved.
- [ ] Page-edit and approval choices are approved.
- [ ] Every money-bearing export and external output must follow the permission.
- [ ] Money-bearing API fields must be omitted or redacted when permission is denied.
- [ ] Customer-facing priced-document exception is approved.
- [ ] Existing project Viewer enforcement gaps should be fixed.
