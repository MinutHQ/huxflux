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

if ! command -v gh &>/dev/null && ! command -v git &>/dev/null; then
  fail "Need gh CLI or git to push to releases repo"
fi

# ── Clone, update, push ─────────────────────────────────────────────────────
step "Syncing install.sh to ${RELEASES_REPO}"

RELEASES_DIR="$(mktemp -d)"
trap "rm -rf '$RELEASES_DIR'" EXIT

git clone --depth 1 "git@github.com:${RELEASES_REPO}.git" "$RELEASES_DIR" 2>/dev/null || \
git clone --depth 1 "https://github.com/${RELEASES_REPO}.git" "$RELEASES_DIR"

cp "$INSTALL_SRC" "$RELEASES_DIR/install.sh"
chmod +x "$RELEASES_DIR/install.sh"

cd "$RELEASES_DIR"

if git diff --quiet install.sh 2>/dev/null && ! git ls-files --error-unmatch install.sh &>/dev/null 2>&1; then
  # New file
  git add install.sh
  git commit -m "add install script"
  git push
  ok "Install script added to releases repo"
elif git diff --quiet install.sh; then
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
