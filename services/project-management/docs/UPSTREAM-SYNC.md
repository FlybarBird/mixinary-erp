# Upstream OpenProject update process

1. Review [OpenProject release notes](https://www.openproject.org/docs/release-notes/) for the next major/minor.
2. Update `OPENPROJECT_VERSION` (image tag major, e.g. `17` → `18`).
3. Backup Postgres volume + `/var/openproject/assets` before upgrade.
4. `docker compose pull && docker compose up -d` and watch seeder/migrations in logs.
5. Smoke-test login, project create via APIv3, and `/project-management` relative root.
6. Record the change in `docs/MODIFICATIONS.md`.
