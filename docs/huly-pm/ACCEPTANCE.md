# Acceptance checklist — Huly Project Management

- [ ] Huly runs independently from the ERP (own Compose project)
- [ ] Restarting Project Management does not restart the ERP
- [ ] Apps share login (Authentik) but not databases
- [ ] Fork/packaging works under `/project-management` (Cloudflare)
- [ ] App selector appears in ERP (and Huly overlay)
- [ ] One ERP project creates exactly one Huly project
- [ ] Duplicate events do not create duplicate projects
- [ ] Users are assigned correctly
- [ ] Disabled users lose PM access (history retained)
- [ ] ERP resources accessible from Huly per permissions
- [ ] Confidential financial information is not exposed by default
- [ ] Huly worklogs/time require ERP approval before affecting cost
- [ ] Upstream Huly updates can be merged and tested (`upstream-sync`)
- [ ] EPL-2.0 compliance process documented
- [ ] Both applications have independent backups and rollback procedures
