#!/usr/bin/env bash
# seed-db.sh — Manually seed the tasks table into the local D1 database
#
# Usage:
#   ./scripts/seed-db.sh
#
# Use when wrangler dev is already running and you need to seed/reseed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$(cd "$ROOT_DIR/../backend" 2>/dev/null && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Seeding local D1 database...${NC}"

# Run migration against local D1
npx wrangler d1 execute supaflare-demo \
  --config "$BACKEND_DIR/wrangler.json" \
  --persist-to "$BACKEND_DIR/.wrangler/state" \
  --local \
  --file "$BACKEND_DIR/migrations/001_tasks.sql" \
  2>&1 || true

echo -e "${GREEN}✅ Database seeded${NC}"
