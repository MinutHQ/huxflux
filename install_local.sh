#!/usr/bin/env bash
# Local development installer — tests the install + setup flow
# without publishing to npm. Uses the local build directly.
#
# Usage: bash install_local.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/apps/server"

if [ -t 1 ]; then
  BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
  GREEN='\033[32m'; YELLOW='\033[33m'; CYAN='\033[36m'; PURPLE='\033[35m'
else
  BOLD=''; DIM=''; RESET=''; GREEN=''; YELLOW=''; CYAN=''; PURPLE=''
fi

echo ""
echo -e "  ${YELLOW}    ╱╲${RESET}"
echo -e "  ${YELLOW}   ╱  ╲${RESET}   ${BOLD}H U X F L U X${RESET}"
echo -e "  ${YELLOW}  ╱ ⚡ ╲${RESET}   ${DIM}Local development install${RESET}"
echo -e "  ${YELLOW}  ╲    ╱${RESET}"
echo -e "  ${YELLOW}   ╲  ╱${RESET}"
echo -e "  ${YELLOW}    ╲╱${RESET}"
echo ""

# ── Build ────────────────────────────────────────────────────────────────────
echo -e "  ${PURPLE}${BOLD}① Building server${RESET}"
echo ""

cd "$SERVER_DIR"
pnpm build 2>&1 | grep -E "success|error|ERR" || true
echo ""
echo -e "  ${GREEN}✓${RESET}  Build complete"

# ── Link globally ────────────────────────────────────────────────────────────
echo ""
echo -e "  ${PURPLE}${BOLD}② Linking as global command${RESET}"
echo ""

npm link 2>&1 | tail -3 || true

VERSION=$(node dist/cli.js --version 2>/dev/null || echo "unknown")
echo -e "  ${GREEN}✓${RESET}  huxflux ${VERSION} linked"

# ── Run setup ────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${PURPLE}${BOLD}③ Launching setup${RESET}"
echo ""

exec node "$SERVER_DIR/dist/cli.js" setup
