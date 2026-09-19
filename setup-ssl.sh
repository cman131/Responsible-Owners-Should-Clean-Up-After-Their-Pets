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
