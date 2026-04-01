#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release-desktop.sh v0.2.0

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASES_REPO="AlexMartosP/huxflux-releases"

# ── Validate arguments ────────────────────────────────────────────────────────

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "Usage: $0 <tag>  (e.g. v0.2.0)" >&2
  exit 1
fi
if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: tag must be semver like v1.2.3, got: $TAG" >&2
  exit 1
fi
VERSION="${TAG#v}"  # strip leading 'v'

# ── Must be on main ───────────────────────────────────────────────────────────

BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on main branch (currently on '$BRANCH')" >&2
  exit 1
fi

# ── Signing key ───────────────────────────────────────────────────────────────

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  KEY_FILE="${HOME}/.tauri/huxflux.key"
  if [[ ! -f "$KEY_FILE" ]]; then
    echo "Error: TAURI_SIGNING_PRIVATE_KEY not set and $KEY_FILE not found" >&2
    echo "Run: cd apps/desktop && pnpm tauri signer generate -w ~/.tauri/huxflux.key" >&2
    exit 1
  fi
  export TAURI_SIGNING_PRIVATE_KEY
  TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
fi
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

# ── Check gh CLI ──────────────────────────────────────────────────────────────

if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI not found. Install: https://cli.github.com" >&2
  exit 1
fi

# ── Build ─────────────────────────────────────────────────────────────────────

TARGET_DIR="$REPO_ROOT/apps/desktop/src-tauri/target"

# Clean up temp DMG files left by hdiutil from any previous failed run
echo "==> Cleaning up leftover DMG temp files..."
find "$TARGET_DIR" -name "rw.*.dmg" -delete 2>/dev/null || true
find "$TARGET_DIR" -path "*/bundle/dmg/*.dmg" -delete 2>/dev/null || true

cd "$REPO_ROOT/apps/desktop"

echo "==> Building macOS ARM (aarch64-apple-darwin)..."
pnpm tauri build --target aarch64-apple-darwin

echo "==> Building macOS Intel (x86_64-apple-darwin)..."
pnpm tauri build --target x86_64-apple-darwin

# ── Locate DMGs ──────────────────────────────────────────────────────────────

ARM_DMG="$(find "$TARGET_DIR/aarch64-apple-darwin/release/bundle/dmg" -name "*.dmg" | head -1)"
X64_DMG="$(find "$TARGET_DIR/x86_64-apple-darwin/release/bundle/dmg" -name "*.dmg"   | head -1)"

for f in "$ARM_DMG" "$X64_DMG"; do
  if [[ -z "$f" || ! -f "$f" ]]; then
    echo "Error: DMG not found — build may have failed" >&2
    exit 1
  fi
done

# ── Create updater tarballs + sign ────────────────────────────────────────────
# tauri build doesn't always auto-generate .app.tar.gz; create and sign explicitly.

APP_NAME="Huxflux"
ARM_BUNDLE_DIR="$TARGET_DIR/aarch64-apple-darwin/release/bundle/macos"
X64_BUNDLE_DIR="$TARGET_DIR/x86_64-apple-darwin/release/bundle/macos"

ARM_TAR="${ARM_BUNDLE_DIR}/${APP_NAME}_${VERSION}_aarch64.app.tar.gz"
X64_TAR="${X64_BUNDLE_DIR}/${APP_NAME}_${VERSION}_x64.app.tar.gz"
ARM_SIG="${ARM_TAR}.sig"
X64_SIG="${X64_TAR}.sig"

echo "==> Creating updater tarballs..."
(cd "$ARM_BUNDLE_DIR" && tar -czf "$ARM_TAR" "${APP_NAME}.app")
(cd "$X64_BUNDLE_DIR" && tar -czf "$X64_TAR" "${APP_NAME}.app")

echo "==> Signing updater tarballs..."
cd "$REPO_ROOT/apps/desktop"
pnpm tauri signer sign --private-key "$TAURI_SIGNING_PRIVATE_KEY" \
  --password "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" "$ARM_TAR"
pnpm tauri signer sign --private-key "$TAURI_SIGNING_PRIVATE_KEY" \
  --password "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" "$X64_TAR"

ARM_DMG_NAME="$(basename "$ARM_DMG")"
X64_DMG_NAME="$(basename "$X64_DMG")"
ARM_TAR_NAME="$(basename "$ARM_TAR")"
X64_TAR_NAME="$(basename "$X64_TAR")"

# ── Generate latest.json ─────────────────────────────────────────────────────

ARM_SIG_CONTENT="$(cat "$ARM_SIG")"
X64_SIG_CONTENT="$(cat "$X64_SIG")"
PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
BASE_URL="https://github.com/${RELEASES_REPO}/releases/download/${TAG}"

LATEST_JSON="$(cat <<JSON
{
  "version": "${TAG}",
  "notes": "",
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "darwin-aarch64": {
      "signature": "${ARM_SIG_CONTENT}",
      "url": "${BASE_URL}/${ARM_TAR_NAME}"
    },
    "darwin-x86_64": {
      "signature": "${X64_SIG_CONTENT}",
      "url": "${BASE_URL}/${X64_TAR_NAME}"
    }
  }
}
JSON
)"

LATEST_JSON_FILE="/tmp/huxflux-latest-${TAG}.json"
echo "$LATEST_JSON" > "$LATEST_JSON_FILE"

# ── Publish release ───────────────────────────────────────────────────────────

echo "==> Creating release ${TAG} on ${RELEASES_REPO}..."
GITHUB_TOKEN="" gh auth switch 2>/dev/null || true
GITHUB_TOKEN="" gh release create "$TAG" \
  --repo "$RELEASES_REPO" \
  --title "Huxflux ${TAG}" \
  --notes "macOS release. The app is unsigned — right-click the .dmg → Open to bypass Gatekeeper." \
  "$ARM_DMG" \
  "$ARM_TAR" \
  "$ARM_SIG" \
  "$X64_DMG" \
  "$X64_TAR" \
  "$X64_SIG" \
  "$LATEST_JSON_FILE#latest.json"

rm -f "$LATEST_JSON_FILE"

echo ""
echo "✓ Released ${TAG} to https://github.com/${RELEASES_REPO}/releases/tag/${TAG}"
