#!/usr/bin/env bash
# Huxflux installer
# Usage: curl -fsSL https://raw.githubusercontent.com/AlexMartosP/huxflux-releases/main/install.sh | bash -s
set -euo pipefail


# ── Colors & helpers ─────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
  RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'
  BLUE='\033[34m'; PURPLE='\033[35m'; CYAN='\033[36m'
else
  BOLD=''; DIM=''; RESET=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; PURPLE=''; CYAN=''
fi

ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
fail() { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }
info() { echo -e "  ${BLUE}→${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}!${RESET}  $*"; }
step() { echo -e "\n  ${PURPLE}${BOLD}$*${RESET}"; }

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${YELLOW}    ╱╲${RESET}"
echo -e "  ${YELLOW}   ╱  ╲${RESET}   ${BOLD}H U X F L U X${RESET}"
echo -e "  ${YELLOW}  ╱ ⚡ ╲${RESET}   ${DIM}Run AI agents from anywhere${RESET}"
echo -e "  ${YELLOW}  ╲    ╱${RESET}   ${DIM}Orchestrate. Automate. Ship.${RESET}"
echo -e "  ${YELLOW}   ╲  ╱${RESET}"
echo -e "  ${YELLOW}    ╲╱${RESET}"
echo ""

# ── Check Node.js ────────────────────────────────────────────────────────────
step "① Checking requirements"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo -e "  ${RED}Node.js is not installed.${RESET}"
  echo ""
  echo "  Huxflux requires Node.js 22.6 or later."
  echo ""
  echo -e "  Install via nvm (recommended):"
  echo -e "    ${DIM}curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash${RESET}"
  echo -e "    ${DIM}nvm install 22${RESET}"
  echo ""
  echo -e "  Or download from: ${BOLD}https://nodejs.org${RESET}"
  echo ""
  exit 1
fi

NODE_VER=$(node --version 2>&1 | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_VER" | cut -d. -f2)

if [ "$NODE_MAJOR" -lt 22 ] || ([ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 6 ]); then
  echo ""
  echo -e "  ${RED}Node.js v${NODE_VER} is too old.${RESET}"
  echo ""
  echo "  Huxflux requires Node.js >= 22.6.0"
  echo ""
  echo -e "  Upgrade via nvm: ${DIM}nvm install 22${RESET}"
  echo -e "  Or download:     ${BOLD}https://nodejs.org${RESET}"
  echo ""
  exit 1
fi

ok "Node.js v${NODE_VER}"

# ── Detect package manager ───────────────────────────────────────────────────
# Always use npm for global installs — pnpm/yarn global can have PATH issues
PM="npm"
PM_GLOBAL="npm install -g"
ok "npm $(npm --version)"

# ── Check if already installed ───────────────────────────────────────────────
if command -v huxflux >/dev/null 2>&1; then
  CURRENT=$(huxflux --version 2>/dev/null || echo "unknown")
  info "Huxflux ${CURRENT} is already installed, upgrading..."
fi

# ── Install ──────────────────────────────────────────────────────────────────
step "② Installing Huxflux"
echo ""

if ! $PM_GLOBAL @alexmartosp/huxflux 2>&1; then
  echo ""
  if [ "$PM" = "npm" ]; then
    warn "Global install failed. Trying with sudo..."
    if ! sudo npm install -g @alexmartosp/huxflux 2>&1; then
      fail "Installation failed. Try using nvm for a user-level Node.js install."
    fi
  else
    fail "Installation failed. Check permissions and try again."
  fi
fi

# ── Verify ───────────────────────────────────────────────────────────────────
echo ""
if ! command -v huxflux >/dev/null 2>&1; then
  NPM_PREFIX=$(npm config get prefix 2>/dev/null || echo "")
  warn "huxflux command not found in PATH"
  echo ""
  echo "  Add the global bin directory to your PATH:"
  echo ""
  echo -e "    ${DIM}export PATH=\"${NPM_PREFIX}/bin:\$PATH\"${RESET}"
  echo ""
  echo -e "  Add it to your shell config (${DIM}~/.zshrc${RESET} or ${DIM}~/.bashrc${RESET}), then:"
  echo -e "    ${DIM}source ~/.zshrc${RESET}"
  echo ""
  echo -e "  Then run: ${BOLD}huxflux setup${RESET}"
  exit 0
fi

HUXFLUX_VER=$(huxflux --version 2>/dev/null || echo "installed")
ok "Huxflux ${HUXFLUX_VER}"

# ── Security notice (brief) ──────────────────────────────────────────────────
echo ""
echo -e "  ${YELLOW}${BOLD}⚠ Security:${RESET} The auth token grants shell access to this machine."
echo -e "  ${DIM}  Treat it like an SSH key. Run 'huxflux security' for full details.${RESET}"

# ── Launch setup wizard ───────────────────────────────────────────────────────
step "③ Setting up your environment"
echo ""

# When piped from curl, stdin is the script not the terminal.
# Launch setup in a fresh bash with proper TTY attached.
if [ ! -t 0 ]; then
  bash -c 'huxflux setup' </dev/tty
else
  huxflux setup
fi
