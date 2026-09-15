# Acceptance checklist — OpenProject Project Management

- [ ] OpenProject runs independently from the ERP (own Compose project `mixinary-pm`)
- [ ] Restarting Project Management does not restart the ERP
- [ ] Apps share login (Authentik) but not databases
- [ ] Packaging works under `/project-management` (relative URL root + Cloudflare)
- [ ] App selector appears in ERP
- [ ] One ERP project creates exactly one OpenProject project (APIv3)
- [ ] Duplicate events do not create duplicate projects
- [ ] Users are assigned correctly
- [ ] Disabled users lose PM access (history retained)
- [ ] Confidential financial information is not exposed by default
- [ ] OpenProject time entries / worklogs require ERP approval before affecting cost
- [ ] Upstream OpenProject image updates can be pulled and tested (`docs/UPSTREAM-SYNC.md`)
- [ ] GPL-3 packaging notes followed (`docs/LICENSE.md`)
- [ ] Both applications have independent backups and rollback procedures
