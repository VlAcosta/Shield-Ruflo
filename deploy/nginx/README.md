# Business Shield nginx hardening

These snippets are designed for the existing production nginx HTTPS server for
`bis-shield.ru`. They do **not** replace the API proxy or certificate setup.

## Files

- `bis-shield-security-headers.conf` — browser security headers and frontend CSP.
- `bis-shield-spa-hardening.conf` — dotfile/internal-route protection, hashed
  asset caching, and no-cache handling for the SPA shell.

## Safe installation

First identify the currently enabled Business Shield site and back it up:

```bash
sudo nginx -T 2>/dev/null | grep -n "server_name.*bis-shield.ru"
sudo cp -a /etc/nginx/sites-available/bis-shield \
  "/etc/nginx/sites-available/bis-shield.backup.$(date -u +%Y%m%dT%H%M%SZ)"
```

If the active site uses a different filename, back up that file instead.

Install the version-controlled snippets:

```bash
sudo install -m 0644 deploy/nginx/bis-shield-security-headers.conf \
  /etc/nginx/snippets/bis-shield-security-headers.conf

sudo install -m 0644 deploy/nginx/bis-shield-spa-hardening.conf \
  /etc/nginx/snippets/bis-shield-spa-hardening.conf
```

Inside the existing **HTTPS** `server { ... }` block, after the existing
`root /var/www/bis-shield/build;` directive, add:

```nginx
include /etc/nginx/snippets/bis-shield-security-headers.conf;
include /etc/nginx/snippets/bis-shield-spa-hardening.conf;
```

The SPA hardening snippet defines exact/specific locations for
`/internal/metrics`, hidden/source files, `/assets/`, and `/index.html`.
If the current site already defines one of those locations, merge the settings
rather than keeping two duplicate nginx locations.

Do not modify the existing `/api/` proxy, TLS certificate paths, ACME
challenge handling, or HTTP-to-HTTPS redirect as part of this change.

## Validation

Always test syntax before reload:

```bash
sudo nginx -t
```

Only after a successful test:

```bash
sudo systemctl reload nginx
```

Then run both production checks:

```bash
./scripts/production-smoke.sh
./scripts/production-security-smoke.sh
```

The security smoke verifies:

- HSTS, CSP, MIME sniffing, frame and privacy headers;
- immutable one-year caching for hashed Vite assets;
- `404` for dotfiles and the private `/internal/metrics` path;
- HTTP → HTTPS redirect.

If the frontend fails after enabling CSP, restore the site backup immediately,
reload nginx, and inspect the browser console before widening the policy. Do not
silently add `unsafe-eval` or wildcard script origins.
