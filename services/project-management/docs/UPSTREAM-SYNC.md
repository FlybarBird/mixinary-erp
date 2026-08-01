# Upstream Huly update process

1. Review platform release notes + huly-selfhost `MIGRATION.md`
2. Merge/tag into `upstream-sync`
3. Resolve conflicts in company overlays
4. Run automated tests (base-path suite)
5. Test ERP synchronization
6. Test Authentik OIDC
7. Test `/project-management` via Cloudflare
8. Test uploads / realtime
9. Test DB migrations on staging copy
10. Deploy staging → approve → backup prod → tagged deploy

Never auto-deploy newest upstream tip to production.
Use production `v*` tags only.
