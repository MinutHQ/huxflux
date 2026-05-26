#!/usr/bin/env bash
set -euo pipefail

# Syncs install.sh to the public huxflux-releases repo so users can:
#   curl -fsSL https://raw.githubusercontent.com/AlexMartosP/huxflux-releases/main/install.sh | bash
#
# Usage:
#   ./scripts/release-install.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASES_REPO="AlexMartosP/huxflux-releases"
INSTALL_SRC="$REPO_ROOT/install.sh"

BOLD='\033[1m'; RESET='\033[0m'
GREEN='\033[32m'; RED='\033[31m'; YELLOW='\033[33m'; PURPLE='\033[35m'

ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
fail() { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }
step() { echo -e "\n  ${PURPLE}${BOLD}$*${RESET}"; }

echo ""
echo -e "  ${BOLD}Publish Install Script${RESET}"

# ── Guards ───────────────────────────────────────────────────────────────────
if [[ ! -f "$INSTALL_SRC" ]]; then
  fail "install.sh not found at $INSTALL_SRC"
fi

if ! command -v gh &>/dev/null; then
  fail "gh CLI not found. Install: https://cli.github.com"
fi

# ── Switch to correct GitHub account ─────────────────────────────────────────
step "Syncing install.sh to ${RELEASES_REPO}"

GITHUB_TOKEN="" gh auth switch --user AlexMartosP 2>/dev/null || true

RELEASES_DIR="$(mktemp -d)"
trap "rm -rf '$RELEASES_DIR'" EXIT

GITHUB_TOKEN="" gh repo clone "$RELEASES_REPO" "$RELEASES_DIR" -- --depth 1 2>/dev/null

cp "$INSTALL_SRC" "$RELEASES_DIR/install.sh"
chmod +x "$RELEASES_DIR/install.sh"

cd "$RELEASES_DIR"

if git diff --quiet install.sh 2>/dev/null && git ls-files --error-unmatch install.sh &>/dev/null 2>&1; then
  ok "Install script already up to date"
else
  git add install.sh
  git commit -m "update install script"
  git push
  ok "Install script updated"
fi

echo ""
echo -e "  ${GREEN}${BOLD}✓ Install script published${RESET}"
echo ""
echo "  Users can install with:"
echo "    curl -fsSL https://raw.githubusercontent.com/${RELEASES_REPO}/main/install.sh | bash"
echo ""
