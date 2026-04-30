#!/usr/bin/env bash
# deploy-backend.sh — Deploy the Supaflare backend worker to Cloudflare Workers
#
# Usage:
#   cd backend && ./deploy.sh

set -euo pipefail

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════════╗"
echo "║       Supaflare Backend — Deploy            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Build teenybase if needed
TEENYBASE_DIR="$(cd "$(dirname "$0")/../packages/teenybase" 2>/dev/null && pwd)"
if [ ! -d "$TEENYBASE_DIR/dist" ]; then
  echo "[1/3] Building teenybase..."
  cd "$TEENYBASE_DIR"
  npm install 2>&1 | grep -v "npm warn" || true
  npm run build-ts
  cd - > /dev/null
fi

echo "[2/3] Applying migrations..."
npx wrangler d1 execute supaflare-demo \
  --config wrangler.json \
  --file migrations/001_tasks.sql \
  --remote 2>&1 || echo "  (Migration may already be applied)"

echo "[3/3] Deploying worker..."
npx wrangler deploy --config wrangler.json

echo ""
echo "✅ Backend deployed!"
echo "  Check the URL above for your worker endpoint"
echo ""
echo "  Then set on Pages:"
echo "    VITE_SUPAFLARE_URL=<worker-url>"
