# Mixinary Project Management (Plane CE fork packaging)

This directory is the company packaging layer for our Plane Community Edition fork.

**Upstream pin:** Plane CE `v1.3.1` (`makeplane/plane`)

**Intended standalone repository:** `FlybarBird/project-management`

Until that repo is created in GitHub, this tree lives in `mixinary-erp` under
`services/project-management/` and must be extracted without copying proprietary
ERP application code.

## Remotes (after extraction)

```bash
git remote add origin git@github.com:FlybarBird/project-management.git
git remote add upstream https://github.com/makeplane/plane.git
```

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready company version |
| `develop` | Current integration work |
| `upstream-sync` | Testing official Plane updates |
| `feature/*` | Individual changes |

## Deploy tags

`erp-pm-<company-semver>-plane-<upstream-tag>`

Example: `erp-pm-1.0.0-plane-v1.3.1`

## Bootstrap upstream source (not vendored in ERP git)

```bash
./scripts/bootstrap-upstream.sh
```

This clones Plane at the pinned tag into `.upstream/` (gitignored) and applies
company overlays from `overlays/` and `company/`.

## License

Plane CE is AGPL-3.0. See `docs/AGPL-COMPLIANCE.md`.
