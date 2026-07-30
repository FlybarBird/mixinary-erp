# Acceptance checklist — Forked Plane Project Management

- [ ] Forked Plane runs independently from the ERP (own Compose project)
- [ ] Restarting Project Management does not restart the ERP
- [ ] Apps share login (Authentik) but not databases
- [ ] Fork works under `/project-management` (Cloudflare)
- [ ] App selector appears in ERP and Plane
- [ ] One ERP project creates exactly one Plane project
- [ ] Duplicate events do not create duplicate projects
- [ ] Users are assigned correctly
- [ ] Disabled users lose Plane access (history retained)
- [ ] ERP resources accessible from Plane per permissions
- [ ] Confidential financial information is not exposed by default
- [ ] Plane worklogs require ERP approval before affecting cost
- [ ] Upstream Plane updates can be merged and tested (`upstream-sync`)
- [ ] AGPL compliance process documented and followed
- [ ] Both applications have independent backups and rollback procedures
