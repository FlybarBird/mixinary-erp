
# Upstream Plane update process

For every Plane release:

1. Review release notes and security advisories
2. Merge the release into `upstream-sync`
3. Resolve conflicts
4. Run automated tests (`npm test`, base-path suite)
5. Test ERP synchronization
6. Test shared login (Authentik)
7. Test `/project-management` base path
8. Test uploads and real-time updates
9. Test database migrations on a staging copy
10. Deploy to staging
11. Approve production deployment
12. Back up production
13. Deploy using the tagged company image

Never auto-deploy newest upstream tip to production.
