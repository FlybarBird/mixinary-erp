
# Cloudflare routing for Project Management

## Goal

`https://<company-domain>/project-management` → Mixinary Plane stack  
Other suite paths → ERP (Vercel) / Authentik / Client Documents / Admin

## Recommended: Cloudflare Tunnel

On the Docker host (operator-chosen):

```bash
cloudflared tunnel create mixinary-pm
cloudflared tunnel route dns mixinary-pm <company-domain>
```

`cloudflared` config example (`cloudflared-config.yml`):

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: <company-domain>
    path: /project-management*
    service: http://127.0.0.1:8088
  - hostname: <company-domain>
    path: /auth*
    service: http://127.0.0.1:9000   # Authentik
  - hostname: <company-domain>
    path: /integration*
    service: http://127.0.0.1:8091
  - hostname: <company-domain>
    path: /shared-files*
    service: http://127.0.0.1:8092
  - service: http_status:404
```

ERP remains on Vercel; use Cloudflare DNS/proxied record or Worker to send
non-PM paths to the Vercel origin.

## Fallback

If subpath is unreliable: `https://<company-domain>:8443` published from
`mixinary-pm-proxy`. Landing page and app selector still deep-link users.
