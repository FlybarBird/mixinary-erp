# Extract to FlybarBird/project-management

1. Create empty repo `FlybarBird/project-management`.
2. Copy this directory contents to the new repo root (not the ERP `src/`).
3. Run `./scripts/bootstrap-upstream.sh` and commit company overlays + compose.
4. Add remotes `origin` / `upstream` as documented in README.
5. Remove this tree from `mixinary-erp` after extraction (keep only API clients).
