# Cloudflare routing for OpenProject

`https://<company-domain>/project-management` → Mixinary OpenProject on `127.0.0.1:8087`

Unlike Huly, OpenProject does **not** need separate `/_accounts` / `/_transactor` routes when using a relative URL root.

## Example tunnel ingress

```yaml
ingress:
  - hostname: example.com
    path: /project-management*
    service: http://127.0.0.1:8087
  - hostname: example.com
    path: /auth*
    service: http://127.0.0.1:9000
  - hostname: example.com
    path: /integration*
    service: http://127.0.0.1:8091
  - hostname: example.com
    path: /shared-files*
    service: http://127.0.0.1:8092
  - service: http_status:404
```

Set `OPENPROJECT_HOST__NAME` to the public hostname and `OPENPROJECT_HTTPS=true` once TLS is terminated at Cloudflare.

ERP (Vercel) continues to serve non-PM paths. Keep `NEXT_PUBLIC_PM_BASE_PATH=/project-management`.
