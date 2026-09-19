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
