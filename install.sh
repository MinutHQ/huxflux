#!/usr/bin/env bash
# Huxflux installer
# Usage: curl -fsSL https://raw.githubusercontent.com/MinutHQ/huxflux/main/install.sh | bash
#        curl -fsSL ... | bash -s -- --beta
#        curl -fsSL ... | bash -s -- --uninstall
set -euo pipefail

CHANNEL="latest"
for arg in "$@"; do
  case "$arg" in
    --beta) CHANNEL="beta" ;;
  esac
done

# ── Uninstall mode ──────────────────────────────────────────────────────────
if [ "${1:-}" = "--uninstall" ]; then
  echo ""
  echo "  Removing Huxflux..."
  echo ""

  # Stop server
  if command -v huxflux >/dev/null 2>&1; then
    huxflux stop 2>/dev/null || true
  fi

  # Remove system service
  if [ "$(uname -s)" = "Darwin" ]; then
    PLIST="$HOME/Library/LaunchAgents/com.huxflux.server.plist"
    [ -f "$PLIST" ] && launchctl unload "$PLIST" 2>/dev/null && rm -f "$PLIST"
  elif [ "$(uname -s)" = "Linux" ]; then
    systemctl --user stop huxflux 2>/dev/null || true
    systemctl --user disable huxflux 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/huxflux.service"
    systemctl --user daemon-reload 2>/dev/null || true
  fi

  # Remove npm package
  npm uninstall -g @minuthq/huxflux 2>/dev/null || true

  # Remove data
  rm -rf "$HOME/huxflux"

  # Detach any mounted Huxflux DMG volumes
  for vol in /Volumes/Huxflux*; do
    [ -d "$vol" ] && hdiutil detach "$vol" -quiet -force 2>/dev/null || true
  done

  # Remove desktop app
  rm -f "$HOME/.local/bin/Huxflux.AppImage"
  rm -f "$HOME/.local/share/applications/huxflux.desktop"
  rm -rf "/Applications/Huxflux.app" 2>/dev/null || true
  rm -rf "$HOME/Applications/Huxflux.app" 2>/dev/null || true

  # Remove temp attachments
  rm -rf "/tmp/huxflux-attachments" 2>/dev/null || true
  rm -rf /tmp/huxflux-desktop-* 2>/dev/null || true

  echo "  ✓ Huxflux removed."
  echo ""
  exit 0
fi

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

if [ "$NODE_MAJOR" -gt 24 ]; then
  warn "Node.js ${NODE_VER} is not fully supported. Terminal features may not work."
  echo -e "  ${DIM}Recommended: Node.js 22 (LTS). Switch with: nvm install 22 && nvm use 22${RESET}"
  echo ""
fi

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

# ── Channel selection ────────────────────────────────────────────────────────
# If --beta was passed, skip the prompt. Otherwise ask the user.
if [ "$CHANNEL" = "latest" ] && { [ -t 0 ] || [ -e /dev/tty ]; }; then
  echo ""
  echo -e "  ${BOLD}Which release channel?${RESET}"
  echo ""

  SEL=0
  OPTIONS=("stable" "beta")
  DESCS=("recommended, tested releases" "early features, may have bugs")
  COLORS=("$GREEN" "$YELLOW")

  render_menu() {
    for i in 0 1; do
      if [ "$SEL" -eq "$i" ]; then
        echo -e "    ${COLORS[$i]}▸ ${OPTIONS[$i]}${RESET}  ${DIM}(${DESCS[$i]})${RESET}"
      else
        echo -e "    ${DIM}  ${OPTIONS[$i]}  (${DESCS[$i]})${RESET}"
      fi
    done
  }

  render_menu

  TTY_IN="/dev/tty"
  while true; do
    IFS= read -rsn1 key <"$TTY_IN"
    if [ "$key" = $'\x1b' ]; then
      read -rsn2 rest <"$TTY_IN"
      case "$rest" in
        '[A') SEL=$(( SEL == 0 ? 1 : 0 )) ;;  # up
        '[B') SEL=$(( SEL == 0 ? 1 : 0 )) ;;  # down
      esac
      printf "\033[2A\r"
      render_menu
    elif [ "$key" = "" ]; then
      break
    fi
  done

  if [ "$SEL" -eq 1 ]; then
    CHANNEL="beta"
  fi
fi

# ── Configure npm registry ───────────────────────────────────────────────────
# GitHub Packages requires the scope registry to be set
NPMRC="$HOME/.npmrc"
if ! grep -q "@minuthq:registry=https://npm.pkg.github.com" "$NPMRC" 2>/dev/null; then
  echo "@minuthq:registry=https://npm.pkg.github.com" >> "$NPMRC"
fi

# ── Install ──────────────────────────────────────────────────────────────────
step "② Installing Huxflux"
echo ""

# Fetch the version we're about to install
INSTALL_VER=$(npm view "@minuthq/huxflux@${CHANNEL}" version 2>/dev/null || echo "")
if [ -n "$INSTALL_VER" ]; then
  info "Installing @minuthq/huxflux@${INSTALL_VER} (${CHANNEL})"
else
  info "Installing @minuthq/huxflux@${CHANNEL}"
fi

if ! $PM_GLOBAL "@minuthq/huxflux@${CHANNEL}" 2>&1; then
  echo ""
  if [ "$PM" = "npm" ]; then
    warn "Global install failed. Trying with sudo..."
    if ! sudo npm install -g "@minuthq/huxflux@${CHANNEL}" 2>&1; then
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
  NPM_BIN="${NPM_PREFIX}/bin"

  if [ -d "$NPM_BIN" ]; then
    warn "huxflux not found in PATH"
    echo ""
    echo -e "  The npm global bin directory ${DIM}${NPM_BIN}${RESET} is not in your PATH."
    echo ""

    # Detect shell config file
    SHELL_RC=""
    if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL" 2>/dev/null)" = "zsh" ]; then
      SHELL_RC="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
      SHELL_RC="$HOME/.bashrc"
    elif [ -f "$HOME/.profile" ]; then
      SHELL_RC="$HOME/.profile"
    fi

    FIXED=false
    if [ -n "$SHELL_RC" ] && [ -t 0 ] || [ -e /dev/tty ]; then
      # Ask permission to fix PATH
      echo -e "  Add it to ${DIM}${SHELL_RC}${RESET} automatically?"
      echo ""
      printf "  [Y/n] "
      if [ -t 0 ]; then
        read -r REPLY
      else
        read -r REPLY </dev/tty
      fi

      if [ -z "$REPLY" ] || [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
        echo "" >> "$SHELL_RC"
        echo "# Added by Huxflux installer" >> "$SHELL_RC"
        echo "export PATH=\"${NPM_BIN}:\$PATH\"" >> "$SHELL_RC"
        export PATH="${NPM_BIN}:$PATH"
        ok "Added to ${SHELL_RC}"
        FIXED=true
      fi
    fi

    if [ "$FIXED" = "false" ]; then
      echo "  Add this to your shell config manually:"
      echo ""
      echo -e "    ${DIM}export PATH=\"${NPM_BIN}:\$PATH\"${RESET}"
      echo ""
      echo -e "  Then run: ${BOLD}source ${SHELL_RC:-~/.bashrc} && huxflux setup${RESET}"
      exit 0
    fi
  else
    warn "huxflux command not found in PATH"
    echo ""
    echo -e "  Could not determine npm bin directory."
    echo -e "  Try: ${DIM}npm bin -g${RESET} and add it to your PATH."
    echo ""
    echo -e "  Then run: ${BOLD}huxflux setup${RESET}"
    exit 0
  fi

  # Verify again after PATH fix
  if ! command -v huxflux >/dev/null 2>&1; then
    warn "huxflux still not found after PATH update"
    echo ""
    echo -e "  Open a new terminal and run: ${BOLD}huxflux setup${RESET}"
    exit 0
  fi
fi

HUXFLUX_VER=$(huxflux --version 2>/dev/null || echo "installed")
ok "Huxflux ${HUXFLUX_VER}"

# ── Save channel preference ──────────────────────────────────────────────────
if [ "$CHANNEL" = "beta" ]; then
  HUXFLUX_DIR="$HOME/huxflux"
  SETTINGS_FILE="$HUXFLUX_DIR/settings.json"
  mkdir -p "$HUXFLUX_DIR"

  if [ -f "$SETTINGS_FILE" ]; then
    # Merge updateChannel into existing settings (simple sed, avoids jq dependency)
    if grep -q '"updateChannel"' "$SETTINGS_FILE" 2>/dev/null; then
      sed -i.bak 's/"updateChannel"[[:space:]]*:[[:space:]]*"[^"]*"/"updateChannel": "beta"/' "$SETTINGS_FILE"
      rm -f "${SETTINGS_FILE}.bak"
    else
      # Insert updateChannel before the closing brace
      sed -i.bak 's/}$/,"updateChannel": "beta"}/' "$SETTINGS_FILE"
      rm -f "${SETTINGS_FILE}.bak"
    fi
  else
    echo '{"updateChannel":"beta"}' > "$SETTINGS_FILE"
  fi
  ok "Update channel set to beta"
fi

# ── Launch setup wizard ───────────────────────────────────────────────────────
step "③ Running setup"
echo ""

# When piped from curl, stdin is the script not the terminal.
# Launch setup in a fresh bash with proper TTY attached.
if [ ! -t 0 ]; then
  bash -c 'huxflux setup' </dev/tty
else
  huxflux setup
fi
