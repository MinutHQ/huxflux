#!/usr/bin/env bash
# huxflux installer
# Usage: curl -fsSL https://get.huxflux.dev | bash
set -euo pipefail

# ── Terminal colors ───────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; NC=''
fi

info()    { echo -e "  ${BLUE}→${NC}  $*"; }
ok()      { echo -e "  ${GREEN}✓${NC}  $*"; }
warn()    { echo -e "  ${YELLOW}!${NC}  $*"; }
die()     { echo -e "  ${RED}✗${NC}  $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}$*${NC}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "  ╭───────────────────────────╮"
echo "  │  huxflux  installer       │"
echo "  ╰───────────────────────────╯"
echo ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
header "Checking requirements"

if ! command -v node >/dev/null 2>&1; then
  die "Node.js not found. Install Node.js 18+ from https://nodejs.org and re-run."
fi

NODE_VER=$(node --version 2>&1 | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js 20+ required (found v$NODE_VER). Upgrade at https://nodejs.org"
fi
ok "Node.js v$NODE_VER"

if ! command -v npm >/dev/null 2>&1; then
  die "npm not found — it should ship with Node.js. Check your installation."
fi
ok "npm $(npm --version)"

# ── GitHub auth check ─────────────────────────────────────────────────────────
# huxflux is distributed via GitHub Packages, which requires authentication.
# Check for a token in ~/.npmrc or prompt the user to add one.

GH_TOKEN=$(npm config get //npm.pkg.github.com/:_authToken 2>/dev/null || true)
if [ -z "$GH_TOKEN" ] || [ "$GH_TOKEN" = "undefined" ] || [ "$GH_TOKEN" = "null" ]; then
  echo ""
  echo -e "  ${BOLD}GitHub authentication required${NC}"
  echo ""
  echo "  huxflux is distributed via GitHub Packages."
  echo "  You need a GitHub personal access token (classic) with"
  echo "  the 'read:packages' scope."
  echo ""
  echo "  1. Create a token: https://github.com/settings/tokens/new"
  echo "     Scope required: read:packages"
  echo ""
  echo "  2. Add it to ~/.npmrc (replace YOUR_TOKEN):"
  echo "     echo '@alexmartosp:registry=https://npm.pkg.github.com' >> ~/.npmrc"
  echo "     echo '//npm.pkg.github.com/:_authToken=YOUR_TOKEN' >> ~/.npmrc"
  echo ""
  echo "  3. Re-run this installer."
  echo ""
  die "No GitHub token found in ~/.npmrc"
fi
ok "GitHub token found"

# Ensure the @alexmartosp scope is routed to GitHub Packages.
# Only scoped routing is set — all other packages still resolve from npm.
if ! grep -q "@alexmartosp:registry" "${HOME}/.npmrc" 2>/dev/null; then
  echo "@alexmartosp:registry=https://npm.pkg.github.com" >> "${HOME}/.npmrc"
  info "Added @alexmartosp scope routing to ~/.npmrc"
fi

# ── Install ───────────────────────────────────────────────────────────────────
header "Installing huxflux"

info "Running: npm install -g @alexmartosp/huxflux"
if ! npm install -g @alexmartosp/huxflux 2>&1; then
  echo ""
  warn "Global install failed. Trying with sudo..."
  if ! sudo npm install -g @alexmartosp/huxflux 2>&1; then
    die "Installation failed. Check npm permissions or use nvm/fnm for a user-level Node.js install."
  fi
fi
ok "huxflux installed"

# ── Verify PATH ───────────────────────────────────────────────────────────────
if ! command -v huxflux >/dev/null 2>&1; then
  NPM_PREFIX=$(npm config get prefix)
  warn "huxflux is not in your PATH."
  echo ""
  echo "  Add npm's global bin directory to your PATH:"
  echo ""
  echo "    export PATH=\"${NPM_PREFIX}/bin:\$PATH\""
  echo ""
  echo "  Paste the above into ~/.bashrc or ~/.zshrc, then:"
  echo "    source ~/.bashrc   # or ~/.zshrc"
  echo ""
  echo "  Then run: huxflux"
  exit 0
fi

HUXFLUX_VER=$(huxflux --version 2>/dev/null || echo "installed")
ok "huxflux $HUXFLUX_VER"

# ── Security disclaimer ───────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}${BOLD}║                  ⚠  SECURITY — READ THIS                        ║${NC}"
echo -e "${YELLOW}${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}The auth token grants full shell access to this machine.${NC}"
echo -e "  ${BOLD}Treat it like an SSH private key — keep it secret.${NC}"
echo ""
echo -e "  ${BOLD}1. Use a dedicated non-root user  (strongly recommended)${NC}"
echo "     Claude can read and write every file your OS user can access."
echo "     Run huxflux as a separate low-privilege user, not your main"
echo "     account and never as root."
echo ""
echo "     # Create a dedicated user (Linux):"
echo "     #   sudo useradd -m -s /bin/bash huxflux-user"
echo "     #   sudo -u huxflux-user npm install -g huxflux"
echo "     #   sudo -u huxflux-user huxflux start"
echo ""
echo -e "  ${BOLD}2. Use Tailscale for encrypted access  (strongly recommended)${NC}"
echo "     Without TLS your token and all data travel in plaintext."
echo "     Tailscale (WireGuard-based) encrypts everything for free:"
echo ""
echo "       https://tailscale.com/download"
echo ""
echo "     Once installed, use the Tailscale IP in your connection string:"
echo "       huxflux://100.x.x.x:4321?token=..."
echo ""
echo -e "  ${BOLD}3. Never expose port 4321 to the public internet${NC}"
echo "     If you need public HTTPS access, put huxflux behind Caddy:"
echo ""
echo "       # Install: https://caddyserver.com/docs/install"
echo "       # Caddyfile:"
echo "       #   your.domain.com {"
echo "       #       reverse_proxy localhost:4321"
echo "       #   }"
echo ""
echo -e "  ${BOLD}4. Watch out for prompt injection${NC}"
echo "     If you give Claude access to a repository, malicious content"
echo "     in that repo (README, code comments, test fixtures) can"
echo "     instruct Claude to exfiltrate data or run arbitrary commands."
echo "     Only point huxflux at repositories you trust."
echo ""
echo -e "  ${BOLD}5. Rotate the token if it leaks${NC}"
echo "       huxflux token rotate"
echo "       huxflux stop && huxflux start"
echo ""
echo -e "  ${BOLD}6. Audit who is sending requests${NC}"
echo "       huxflux audit    # tail the request audit log"
echo ""
echo -e "  Run ${BOLD}huxflux security${NC} at any time to review these recommendations."
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
header "Done"

echo "  Run the server:"
echo ""
echo "    huxflux            # start in the background"
echo "    huxflux status     # show URL + auth token"
echo "    huxflux logs       # tail the log"
echo "    huxflux stop       # stop the server"
echo "    huxflux update     # update to the latest version"
echo ""
echo "  Then open the Huxflux web app and add your server under"
echo "  Settings → Servers using the connection string shown by"
echo "  'huxflux status'."
echo ""
