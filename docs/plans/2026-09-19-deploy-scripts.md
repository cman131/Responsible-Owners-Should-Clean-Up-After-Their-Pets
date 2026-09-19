# Deploy Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create three bash scripts (`deploy.sh`, `redeploy.sh`, `setup-ssl.sh`) at the repo root to deploy poke-fighter on an Ubuntu server at `pokefighter.conorwright.net`.

**Architecture:** Mirror the jeopardy project's 3-script pattern, adapted for the pnpm monorepo (shared → server/client build order) and SQLite (no database service). `deploy.sh` handles first-time setup alongside an existing jeopardy nginx config; `redeploy.sh` rebuilds and restarts; `setup-ssl.sh` provisions a Let's Encrypt cert.

**Tech Stack:** bash, pnpm, PM2, nginx, certbot, better-sqlite3 (native addon requiring `build-essential`)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `deploy.sh` | Create | First-time server setup |
| `redeploy.sh` | Create | Pull + rebuild + restart |
| `setup-ssl.sh` | Create | Let's Encrypt HTTPS cert |

---

### Task 1: `deploy.sh`

**Files:**
- Create: `deploy.sh`

- [ ] **Step 1: Write `deploy.sh`**

Create `deploy.sh` at the repo root with the following content:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Run from the project root after cloning to ~/poke-fighter:
#   chmod +x deploy.sh && ./deploy.sh
#
# Expects: Node.js, nginx, and PM2 already installed (shared server with jeopardy).
# Prompts interactively for ADMIN_TOKEN.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="pokefighter.conorwright.net"
SERVER_PORT=3000

echo "==> Checking pnpm"
if ! command -v pnpm &>/dev/null; then
  echo "Installing pnpm..."
  sudo npm install -g pnpm
fi

echo "==> Installing build dependencies (required for better-sqlite3 native addon)"
sudo apt-get install -y build-essential python3-dev

echo "==> Installing workspace dependencies"
cd "$PROJECT_DIR"
pnpm install

echo "==> Building shared package"
pnpm --filter @poke-fighter/shared build

echo "==> Building server"
pnpm --filter @poke-fighter/server build

echo "==> Building client"
pnpm --filter @poke-fighter/client build

echo "==> Configuring environment"
if [[ -f "$PROJECT_DIR/.env" ]]; then
  echo ".env already exists — skipping. Edit $PROJECT_DIR/.env to change ADMIN_TOKEN."
else
  read -rsp "Enter ADMIN_TOKEN: " ADMIN_TOKEN
  echo
  cat > "$PROJECT_DIR/.env" <<ENV
ADMIN_TOKEN=$ADMIN_TOKEN
PORT=$SERVER_PORT
ENV
  echo ".env created at $PROJECT_DIR/.env"
fi

echo "==> Starting app with PM2"
pm2 delete poke-fighter-server 2>/dev/null || true
pm2 start "$PROJECT_DIR/packages/server/dist/index.js" \
  --name poke-fighter-server \
  --cwd "$PROJECT_DIR"
pm2 save

echo "==> Configuring PM2 startup (auto-start on reboot)"
PM2_STARTUP=$(pm2 startup | grep "sudo" | tail -1)
if [[ -n "$PM2_STARTUP" ]]; then
  eval "$PM2_STARTUP"
fi

echo "==> Configuring nginx"
sudo tee /etc/nginx/sites-available/pokefighter > /dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    root $PROJECT_DIR/packages/client/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://localhost:$SERVER_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/pokefighter /etc/nginx/sites-enabled/pokefighter
sudo nginx -t
sudo systemctl reload nginx

echo "==> Configuring firewall"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

echo ""
echo "Deploy complete."
echo "Server IP: $(hostname -I | awk '{print $1}')"
echo "Point your DNS A record for $DOMAIN to the IP above."
echo "Once DNS propagates, run: ./setup-ssl.sh"
```

- [ ] **Step 2: Syntax-check the script**

```bash
bash -n deploy.sh
```

Expected: no output (clean exit). If you see errors, fix them before continuing.

- [ ] **Step 3: Make executable**

```bash
chmod +x deploy.sh
```

- [ ] **Step 4: Commit**

```bash
git add deploy.sh
git commit -m "feat: add deploy.sh for pokefighter.conorwright.net"
```

---

### Task 2: `redeploy.sh`

**Files:**
- Create: `redeploy.sh`

- [ ] **Step 1: Write `redeploy.sh`**

Create `redeploy.sh` at the repo root:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Run after pulling new changes to rebuild and restart the server:
#   ./redeploy.sh
#
# Does not touch .env — secrets persist across deploys.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Pulling latest changes"
git -C "$PROJECT_DIR" pull

echo "==> Installing dependencies"
cd "$PROJECT_DIR"
pnpm install

echo "==> Building shared package"
pnpm --filter @poke-fighter/shared build

echo "==> Building server"
pnpm --filter @poke-fighter/server build

echo "==> Building client"
pnpm --filter @poke-fighter/client build

echo "==> Restarting server"
pm2 restart poke-fighter-server

echo "Done."
```

- [ ] **Step 2: Syntax-check the script**

```bash
bash -n redeploy.sh
```

Expected: no output (clean exit).

- [ ] **Step 3: Make executable**

```bash
chmod +x redeploy.sh
```

- [ ] **Step 4: Commit**

```bash
git add redeploy.sh
git commit -m "feat: add redeploy.sh for poke-fighter"
```

---

### Task 3: `setup-ssl.sh`

**Files:**
- Create: `setup-ssl.sh`

- [ ] **Step 1: Write `setup-ssl.sh`**

Create `setup-ssl.sh` at the repo root:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Run after deploy.sh once the DNS A record for pokefighter.conorwright.net
# points to this server.
#
# Usage: ./setup-ssl.sh [domain]
# Default: pokefighter.conorwright.net

DOMAIN="${1:-pokefighter.conorwright.net}"

echo "==> Installing certbot"
sudo apt-get install -y certbot python3-certbot-nginx

echo "==> Obtaining certificate for $DOMAIN"
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
  --email "admin@conorwright.net"

echo "==> Verifying auto-renewal timer"
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
systemctl status certbot.timer --no-pager

echo ""
echo "HTTPS enabled. App is live at https://$DOMAIN"
echo "Certificates auto-renew via systemd — no action needed."
```

- [ ] **Step 2: Syntax-check the script**

```bash
bash -n setup-ssl.sh
```

Expected: no output (clean exit).

- [ ] **Step 3: Make executable**

```bash
chmod +x setup-ssl.sh
```

- [ ] **Step 4: Commit**

```bash
git add setup-ssl.sh
git commit -m "feat: add setup-ssl.sh for pokefighter.conorwright.net"
```

---

### Task 4: Push to GitHub

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

Expected: three new commits (`deploy.sh`, `redeploy.sh`, `setup-ssl.sh`) pushed.

- [ ] **Step 2: Verify on GitHub**

Open `https://github.com/cman131/Responsible-Owners-Should-Clean-Up-After-Their-Pets` and confirm all three scripts appear at the repo root.

---

## Deployment Sequence (reference)

Once the scripts are pushed, the order of operations on the server is:

```
1. ssh user@server
2. cd ~ && git clone https://github.com/cman131/Responsible-Owners-Should-Clean-Up-After-Their-Pets.git poke-fighter
3. cd poke-fighter
4. chmod +x deploy.sh setup-ssl.sh redeploy.sh
5. ./deploy.sh                     # installs deps, builds, starts PM2, configures nginx
6. # Point DNS A record for pokefighter.conorwright.net to server IP
7. ./setup-ssl.sh                  # once DNS propagates
8. # Future updates:
9. ./redeploy.sh
```
