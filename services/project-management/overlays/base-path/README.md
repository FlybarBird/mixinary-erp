
# `/project-management` base path

Company overlay ensures:

- Frontend asset prefix
- API route prefix
- OIDC callback under base path
- Login/logout redirects stay under base path (never bare ERP `/`)
- Uploads / static / websocket URLs include base path
- Email and notification links include base path

Cloudflare may forward `/project-management` to the Plane proxy with path
preserved. Configure `APP_BASE_PATH=/project-management`.
