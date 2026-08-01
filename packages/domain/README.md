# @mixinary/domain

Shared Mixinary ERP domain logic for the web app and native iPad client.

- **types** — roles, project status, `LinePricing`, list DTOs
- **permissions** — pure role capability checks
- **pricing** — sheet-equivalent MSRP / quote / sale / OOP formulas

Keep this package free of Next.js, React Native, and Supabase imports so both clients can depend on it.
