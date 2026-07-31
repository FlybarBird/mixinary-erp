# Cloudflare routing for Huly Project Management

## Goal

`https://<company-domain>/project-management` → Mixinary Huly nginx  
Account OIDC callbacks must reach the account service as configured in Huly.

## Recommended: Cloudflare Tunnel

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: <company-domain>
    path: /project-management*
    service: http://127.0.0.1:8087
  - hostname: <company-domain>
    path: /_accounts*
    service: http://127.0.0.1:8087
  - hostname: <company-domain>
    path: /_transactor*
    service: http://127.0.0.1:8087
  - hostname: <company-domain>
    path: /_collaborator*
    service: http://127.0.0.1:8087
  - hostname: <company-domain>
    path: /auth*
    service: http://127.0.0.1:9000
  - hostname: <company-domain>
    path: /integration*
    service: http://127.0.0.1:8091
  - hostname: <company-domain>
    path: /shared-files*
    service: http://127.0.0.1:8092
  - service: http_status:404
```

ERP remains on Vercel for non-PM paths. Ensure `HOST_ADDRESS` and nginx paths match how Cloudflare exposes Huly (`/_accounts`, `/_transactor`, etc.).
