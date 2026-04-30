#!/usr/bin/env bash
# start-local.sh — Start Supaflare backend + React frontend
#
# Usage: cd demo-app && ./scripts/start-local.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$(cd "$ROOT_DIR/../backend" 2>/dev/null && pwd)"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Supaflare Demo — Local Dev           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found"
  exit 1
fi

if [ ! -d "$BACKEND_DIR" ]; then
  echo "❌ Backend dir not found at $BACKEND_DIR"
  exit 1
fi

# Install demo app deps
echo -e "${YELLOW}[1/3] Installing frontend dependencies...${NC}"
cd "$ROOT_DIR"
npm install 2>&1 | grep -v "npm warn" || true

# Install backend deps
echo -e "${YELLOW}[2/3] Installing backend dependencies...${NC}"
cd "$BACKEND_DIR"
npm install 2>&1 | grep -v "npm warn" || true

# Create symlink to teenybase if needed
if [ ! -L "$BACKEND_DIR/node_modules/teenybase" ] && [ ! -d "$BACKEND_DIR/node_modules/teenybase" ]; then
  ln -sf ../../packages/teenybase "$BACKEND_DIR/node_modules/teenybase"
fi

# Start backend
echo -e "${YELLOW}[3/3] Starting services...${NC}"
echo ""

cd "$BACKEND_DIR"
rm -rf .wrangler 2>/dev/null || true

# Backend
npx wrangler dev \
  --config wrangler.json \
  --persist-to .wrangler/state \
  --port 8787 \
  --ip 127.0.0.1 \
  &
BACKEND_PID=$!

# Wait for backend
echo -e "  ${YELLOW}Waiting for backend...${NC}"
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:8787/health &>/dev/null; then
    echo -e "  ${GREEN}✅ Backend ready${NC}"
    break
  fi
  sleep 1
done

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "  Backend:  http://127.0.0.1:8787"
echo -e "  Frontend: http://localhost:5173"
echo -e "  API:      /rest/v1/tasks  (PostgREST)"
echo -e "  Auth:     /auth/v1/*      (GoTrue compat)"
echo -e "═══════════════════════════════════════════════${NC}"
echo ""

# Cleanup
trap "kill $BACKEND_PID 2>/dev/null; echo 'Backend stopped'" EXIT

# Frontend
cd "$ROOT_DIR"
npm run dev
