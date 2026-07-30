# Emergency Plane administrator

Maintain a local Plane administrator account for recovery if Authentik is unavailable.

## Policy

- Credentials stored in company secrets manager only (never git)
- Unique strong password / hardware key
- Break-glass use only; audit every login
- Rotate after any emergency use
- Do not use this account for daily operations
