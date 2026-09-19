# Deploy Scripts Design

**Date:** 2026-09-19
**Subdomain:** pokefighter.conorwright.net
**Server:** Same Ubuntu server as jeopardy (Node.js, nginx, PM2 already installed)

## Overview

Three bash scripts at the repo root, mirroring the jeopardy project pattern:

| Script | When to run | Responsibility |
|--------|-------------|----------------|
| `deploy.sh` | Once, after cloning to `~/poke-fighter` | Full first-time setup |
| `setup-ssl.sh` | Once, after DNS A record points to server | Let's Encrypt HTTPS cert |
| `redeploy.sh` | Each time changes are pulled | Rebuild + PM2 restart |

All scripts use `set -euo pipefail` and run from the project root.

## deploy.sh

### Prerequisites handled by the script

- **pnpm**: installed via `npm install -g pnpm` if not already present
- **build-essential + python3-dev**: required for `better-sqlite3`'s native C++ addon to compile; installed via apt if not already present
- Node.js, nginx, and PM2 are already on the server (installed by jeopardy) — the script skips those

### Steps

1. Install pnpm if not present
2. Install `build-essential` and `python3-dev` if not present (native addon build deps)
3. `pnpm install` from project root — installs all workspace packages and compiles native addons
4. Build packages in dependency order:
   - `pnpm --filter @poke-fighter/shared build` (must run first)
   - `pnpm --filter @poke-fighter/server build` and `pnpm --filter @poke-fighter/client build` (can run after shared)
5. Prompt for `ADMIN_TOKEN` with hidden input (`read -s`); write `.env` at project root:
   ```
   ADMIN_TOKEN=<entered value>
   PORT=3000
   ```
6. Start server with PM2:
   ```
   pm2 start packages/server/dist/index.js --name poke-fighter-server --cwd "$PROJECT_DIR"
   ```
   `--cwd` ensures `.env` and `data/` paths resolve correctly relative to the project root.
7. PM2 startup: emit the startup command and run it only if not already registered (idempotent — jeopardy may have already registered it)
8. PM2 save
9. Write nginx site to `/etc/nginx/sites-available/pokefighter`:
   - `server_name pokefighter.conorwright.net`
   - Static serve from `$PROJECT_DIR/packages/client/dist` with SPA fallback (`try_files`)
   - Proxy `/socket.io/` to `localhost:3000` with WebSocket upgrade headers
   - No removal of the `default` site (jeopardy coexistence)
10. Symlink into `sites-enabled`, test nginx config, reload nginx
11. Ensure ufw allows `Nginx Full` and `OpenSSH` (idempotent — already open from jeopardy)
12. Print server IP, DNS tip, and SSL command

### nginx config shape

```nginx
server {
    listen 80;
    server_name pokefighter.conorwright.net;

    root /home/<user>/poke-fighter/packages/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

No `/api/` proxy block — poke-fighter is socket-only, no HTTP REST routes.

## redeploy.sh

1. `git pull` from project root
2. `pnpm install` (picks up new deps; rebuilds native addons if updated)
3. Build in order: shared → server + client
4. `pm2 restart poke-fighter-server`

Does not touch `.env` — secrets persist across deploys.

## setup-ssl.sh

Identical pattern to jeopardy's `setup-ssl.sh`, defaulting to `pokefighter.conorwright.net`:

1. Install `certbot python3-certbot-nginx` (idempotent)
2. `certbot --nginx -d pokefighter.conorwright.net --non-interactive --agree-tos --redirect --email admin@conorwright.net`
3. Enable and start `certbot.timer` for automatic renewal
4. Print confirmation

## Key differences from jeopardy

| Concern | Jeopardy | Poke Fighter |
|---------|----------|--------------|
| Package manager | npm | pnpm |
| Packages | Single root | Monorepo (shared/server/client) |
| Build step | `npm run build` in client/ | shared → server + client (order matters) |
| Database | MongoDB (service) | SQLite via better-sqlite3 (file, no service) |
| Native addons | None | better-sqlite3 (needs build-essential) |
| Server entry | `src/index.js` | `packages/server/dist/index.js` |
| Proxy paths | `/api/` + `/socket.io/` | `/socket.io/` only |
| Static root | `client/dist` | `packages/client/dist` |
| PM2 app name | `jeopardy-server` | `poke-fighter-server` |
| Server port | 3001 | 3000 |
