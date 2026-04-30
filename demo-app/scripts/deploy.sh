#!/usr/bin/env bash
# deploy.sh — Build and deploy the demo app to Cloudflare Pages
#
# Usage:
#   ./scripts/deploy.sh              # deploy to preview branch
#   ./scripts/deploy.sh --prod       # deploy to production (main branch)
#
# Requirements:
#   - Cloudflare account with Wrangler authenticated
#   - `npx wrangler login` completed
#   - Pages project "supaflare-demo" created (or use --project-name)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PRODUCTION=false
PROJECT_NAME="supaflare-demo"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod) PRODUCTION=true; shift ;;
    --project-name) PROJECT_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "╔══════════════════════════════════════════════╗"
echo "║       Supaflare Demo — Deploy               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Install dependencies
echo "[1/3] Installing dependencies..."
cd "$ROOT_DIR"
npm install 2>&1 | grep -v "npm warn" || true

# Build
echo "[2/3] Building..."
npm run build 2>&1

# Deploy
echo "[3/3] Deploying to Cloudflare Pages..."
cd "$ROOT_DIR"

BRANCH="${PRODUCTION:+main}"
if [ -z "$BRANCH" ]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'dev')"
fi

if [ "$PRODUCTION" = true ]; then
  echo "  → Production deploy (main branch)"
else
  echo "  → Preview deploy (branch: $BRANCH)"
fi

npx wrangler pages deploy dist \
  --project-name="$PROJECT_NAME" \
  --branch="$BRANCH"

echo ""
echo "✅ Deploy complete!"
echo ""
echo "  Frontend:  https://$PROJECT_NAME.pages.dev"
echo ""
echo "  ⚠️  Don't forget to:"
echo "     1. Deploy the Supaflare backend worker:"
echo "        cd ../backend && npx wrangler deploy"
echo "     2. Set env vars on Pages:"
echo "        VITE_SUPAFLARE_URL=<your-worker-url>"
echo "        VITE_SUPAFLARE_ANON_KEY=<your-anon-key>"
