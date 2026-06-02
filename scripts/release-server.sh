#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/release-server.sh              # auto-reads version from package.json
#   ./scripts/release-server.sh --dry-run    # build only, don't publish

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$REPO_ROOT/apps/server"
RELEASES_REPO="AlexMartosP/huxflux-releases"

BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
GREEN='\033[32m'; RED='\033[31m'; YELLOW='\033[33m'; PURPLE='\033[35m'

ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
fail() { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }
step() { echo -e "\n  ${PURPLE}${BOLD}$*${RESET}"; }

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Guards ───────────────────────────────────────────────────────────────────
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  fail "Must be on main branch (currently on '$BRANCH')"
fi

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  fail "Working tree is dirty. Commit or stash changes first."
fi

# ── Version bump ─────────────────────────────────────────────────────────────
CURRENT_VERSION="$(node -p "require('$SERVER_DIR/package.json').version")"

echo ""
echo -e "  ${BOLD}Huxflux Server Release${RESET}"
echo -e "  Current version: ${DIM}v${CURRENT_VERSION}${RESET}"
echo ""

# Parse semver
IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"
NEXT_PATCH="${V_MAJOR}.${V_MINOR}.$((V_PATCH + 1))"
NEXT_MINOR="${V_MAJOR}.$((V_MINOR + 1)).0"
NEXT_MAJOR="$((V_MAJOR + 1)).0.0"

echo "  Version bump:"
echo "    1) patch  → ${NEXT_PATCH}"
echo "    2) minor  → ${NEXT_MINOR}"
echo "    3) major  → ${NEXT_MAJOR}"
echo "    4) skip   → keep ${CURRENT_VERSION}"
echo ""
read -rp "  Select [1-4, default=1]: " BUMP_CHOICE

case "${BUMP_CHOICE:-1}" in
  1) VERSION="$NEXT_PATCH" ;;
  2) VERSION="$NEXT_MINOR" ;;
  3) VERSION="$NEXT_MAJOR" ;;
  4) VERSION="$CURRENT_VERSION" ;;
  *) fail "Invalid choice" ;;
esac

if [[ "$VERSION" != "$CURRENT_VERSION" ]]; then
  # Update package.json
  sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${VERSION}\"/" "$SERVER_DIR/package.json"
  git -C "$REPO_ROOT" add "$SERVER_DIR/package.json"
  git -C "$REPO_ROOT" commit -m "chore: bump server to ${VERSION}"
  git -C "$REPO_ROOT" push
  ok "Bumped to v${VERSION}"
else
  ok "Keeping v${VERSION}"
fi

echo ""
echo -e "  ${BOLD}Releasing v${VERSION}${RESET}"
echo ""

# ── Build ────────────────────────────────────────────────────────────────────
step "① Building server and web UI"

cd "$SERVER_DIR"
pnpm build 2>&1 | grep -E "success|error|ERR" || true
ok "Server build complete"

# Build and bundle web UI into server dist
cd "$REPO_ROOT"
pnpm --filter huxflux-web build 2>&1 | tail -3
mkdir -p "$SERVER_DIR/dist/web"
cp -r apps/web/dist/* "$SERVER_DIR/dist/web/"
if [[ ! -f "$SERVER_DIR/dist/web/index.html" ]]; then
  fail "Web UI build failed — dist/web/index.html not found"
fi
ok "Web UI bundled into server"

cd "$SERVER_DIR"

# ── Test (quick sanity check) ────────────────────────────────────────────────
step "② Verifying build"

CLI_VERSION="$(node dist/cli.js --version 2>/dev/null || echo "FAIL")"
if [[ "$CLI_VERSION" != "$VERSION" ]]; then
  fail "CLI version mismatch: expected $VERSION, got $CLI_VERSION"
fi
ok "CLI version: $CLI_VERSION"

# Check that setup command exists
if ! node dist/cli.js help 2>&1 | grep -q "setup"; then
  fail "Setup command not found in built CLI"
fi
ok "Setup command present"

# ── Publish to npm ───────────────────────────────────────────────────────────
step "③ Publishing to npm"

# Ensure logged in
echo -e "  Checking npm auth..."
if ! npm whoami &>/dev/null; then
  echo -e "  ${YELLOW}!${RESET}  Not logged in to npm. Logging in..."
  npm login
fi
ok "Logged in as $(npm whoami)"

if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "  ${YELLOW}!${RESET}  Dry run — skipping npm publish"
  npm pack --dry-run 2>&1 | tail -10
else
  # Check if this version already exists
  PUBLISHED="$(npm view @minuthq/huxflux version 2>/dev/null || echo "none")"
  if [[ "$PUBLISHED" == "$VERSION" ]]; then
    echo -e "  ${YELLOW}!${RESET}  v${VERSION} already published, skipping"
  else
    npm publish --access public 2>&1
    ok "Published @minuthq/huxflux@${VERSION}"
  fi
fi

# ── Copy install script to releases repo ─────────────────────────────────────
step "④ Updating install script"

INSTALL_SRC="$REPO_ROOT/install.sh"
if [[ ! -f "$INSTALL_SRC" ]]; then
  fail "install.sh not found at $INSTALL_SRC"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "  ${YELLOW}!${RESET}  Dry run — skipping install script sync"
else
  GITHUB_TOKEN="" gh auth switch --user AlexMartosP 2>/dev/null || true
  GH_TOKEN="$(GITHUB_TOKEN="" gh auth token)"

  RELEASES_DIR="/tmp/huxflux-releases-$$"
  git clone --depth 1 "https://x-access-token:${GH_TOKEN}@github.com/${RELEASES_REPO}.git" "$RELEASES_DIR"

  cp "$INSTALL_SRC" "$RELEASES_DIR/install.sh"
  chmod +x "$RELEASES_DIR/install.sh"

  cd "$RELEASES_DIR"
  if git diff --quiet install.sh 2>/dev/null && git ls-files --error-unmatch install.sh &>/dev/null 2>&1; then
    ok "Install script unchanged"
  else
    git add install.sh
    git commit -m "chore: update install script (server v${VERSION})"
    git push
    ok "Install script updated in releases repo"
  fi

  rm -rf "$RELEASES_DIR"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}${BOLD}✓ Server v${VERSION} released${RESET}"
echo ""
echo "  Users can update with:"
echo "    huxflux update"
echo "    npm install -g @minuthq/huxflux@latest"
echo ""
echo "  New users:"
echo "    curl -fsSL https://raw.githubusercontent.com/${RELEASES_REPO}/main/install.sh | bash"
echo ""
