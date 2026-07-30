# AGPL-3.0 compliance process

Plane Community Edition is licensed under GNU Affero General Public License v3.

## Obligations (company checklist)

- [ ] Retain copyright and license notices in Plane-derived source and images
- [ ] Track company modifications in `docs/MODIFICATIONS.md`
- [ ] Offer corresponding source for each deployed company image/tag
- [ ] Keep proprietary Mixinary ERP code outside this fork
- [ ] Connect ERP and Plane only via versioned APIs / signed webhooks
- [ ] Legal counsel review before production
- [ ] Trademark review before removing/changing Plane marks (see TRADEMARK.md)

## Corresponding source offer

For each production tag `erp-pm-*-plane-*`:

1. Publish source tarball or public git tag matching the image.
2. Document the offer URL in release notes and `/project-management` ops runbook.
3. Retain source for as long as the image is offered/running (AGPL §6).

## Boundary

| In this fork (AGPL) | Outside (proprietary) |
|---------------------|------------------------|
| Plane CE + company overlays tightly combined with Plane | Mixinary ERP Next.js app |
| ERP Resources panel UI inside Plane | ERP BOM/labor/finance logic |
| Base-path and branding modules | Integration service mapping DB |
