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
  hash -r
fi

echo "==> Installing build dependencies (required for better-sqlite3 native addon)"
sudo apt-get update -y
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

echo "==> Setting permissions for nginx (www-data)"
chmod o+x "$HOME" "$PROJECT_DIR" "$PROJECT_DIR/packages/client" "$PROJECT_DIR/packages/client/dist"
chmod -R o+r "$PROJECT_DIR/packages/client/dist"

echo "==> Configuring environment"
if [[ -f "$PROJECT_DIR/.env" ]]; then
  echo ".env already exists — skipping. Edit $PROJECT_DIR/.env to change ADMIN_TOKEN."
else
  read -rsp "Enter ADMIN_TOKEN: " ADMIN_TOKEN
  echo
  cat > "$PROJECT_DIR/.env" <<ENV
ADMIN_TOKEN="$ADMIN_TOKEN"
PORT=$SERVER_PORT
ENV
  echo ".env created at $PROJECT_DIR/.env"
  chmod 600 "$PROJECT_DIR/.env"
fi

echo "==> Starting app with PM2"
pm2 delete poke-fighter-server 2>/dev/null || true
pm2 start "$PROJECT_DIR/packages/server/dist/index.js" \
  --name poke-fighter-server \
  --cwd "$PROJECT_DIR"

echo "==> Configuring PM2 startup (auto-start on reboot)"
PM2_STARTUP=$(pm2 startup 2>&1 | grep "sudo" | tail -1 || true)
if [[ -n "$PM2_STARTUP" ]]; then
  eval "$PM2_STARTUP" || true
fi
pm2 save

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
