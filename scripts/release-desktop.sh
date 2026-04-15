#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/release-desktop.sh v0.2.0              # macOS: builds macOS + Linux (via Docker)
#   ./scripts/release-desktop.sh v0.2.0 --macos-only # skip Linux Docker build
#   ./scripts/release-desktop.sh v0.2.0 --linux-only # on Linux: builds Linux only
#
# First run on a fresh machine builds the Docker image (~5 min). Subsequent
# Linux builds reuse cached Cargo artifacts and are much faster.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASES_REPO="AlexMartosP/huxflux-releases"
APP_NAME="Huxflux"
DOCKER_IMAGE="huxflux-linux-builder:1"

# ── Arguments ─────────────────────────────────────────────────────────────────

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "Usage: $0 <tag> [--macos-only|--linux-only]  (e.g. v0.2.0)" >&2
  exit 1
fi
if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: tag must be semver like v1.2.3, got: $TAG" >&2
  exit 1
fi
VERSION="${TAG#v}"

MODE="${2:-}"
HOST_OS="$(uname -s)"

if [[ "$MODE" == "--linux-only" ]]; then
  BUILD_MACOS=false; BUILD_LINUX=true
elif [[ "$MODE" == "--macos-only" ]]; then
  BUILD_MACOS=true; BUILD_LINUX=false
elif [[ "$HOST_OS" == "Darwin" ]]; then
  BUILD_MACOS=true; BUILD_LINUX=true
elif [[ "$HOST_OS" == "Linux" ]]; then
  BUILD_MACOS=false; BUILD_LINUX=true
else
  echo "Error: unsupported OS '$HOST_OS'." >&2; exit 1
fi

# ── Guards ────────────────────────────────────────────────────────────────────

BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on main branch (currently on '$BRANCH')" >&2; exit 1
fi

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

if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI not found. Install: https://cli.github.com" >&2; exit 1
fi

TARGET_DIR="$REPO_ROOT/apps/desktop/src-tauri/target"

# ── Bump version in tauri.conf.json ──────────────────────────────────────────

TAURI_CONF="$REPO_ROOT/apps/desktop/src-tauri/tauri.conf.json"
CURRENT_TAURI_VERSION="$(grep -o '"version": "[^"]*"' "$TAURI_CONF" | head -1 | cut -d'"' -f4)"
if [[ "$CURRENT_TAURI_VERSION" != "$VERSION" ]]; then
  echo "==> Bumping tauri.conf.json version: $CURRENT_TAURI_VERSION → $VERSION"
  sed -i '' "s/\"version\": \"${CURRENT_TAURI_VERSION}\"/\"version\": \"${VERSION}\"/" "$TAURI_CONF"
  git -C "$REPO_ROOT" add "$TAURI_CONF"
  git -C "$REPO_ROOT" commit -m "chore: bump desktop version to ${VERSION}"
fi

# Accumulate files to upload and latest.json platform entries
UPLOAD_FILES=()
PLATFORM_ENTRIES=""

# ── macOS build ───────────────────────────────────────────────────────────────

if [[ "$BUILD_MACOS" == "true" ]]; then
  echo "==> Cleaning up leftover DMG temp files..."
  find "$TARGET_DIR" -name "rw.*.dmg" -delete 2>/dev/null || true
  find "$TARGET_DIR" -path "*/bundle/dmg/*.dmg" -delete 2>/dev/null || true

  cd "$REPO_ROOT/apps/desktop"

  echo "==> Building macOS ARM (aarch64-apple-darwin)..."
  pnpm tauri build --target aarch64-apple-darwin

  echo "==> Building macOS Intel (x86_64-apple-darwin)..."
  pnpm tauri build --target x86_64-apple-darwin

  ARM_DMG="$(find "$TARGET_DIR/aarch64-apple-darwin/release/bundle/dmg" -name "*.dmg" | head -1)"
  X64_DMG="$(find "$TARGET_DIR/x86_64-apple-darwin/release/bundle/dmg"  -name "*.dmg" | head -1)"
  for f in "$ARM_DMG" "$X64_DMG"; do
    [[ -n "$f" && -f "$f" ]] || { echo "Error: DMG not found" >&2; exit 1; }
  done

  ARM_BUNDLE_DIR="$TARGET_DIR/aarch64-apple-darwin/release/bundle/macos"
  X64_BUNDLE_DIR="$TARGET_DIR/x86_64-apple-darwin/release/bundle/macos"
  ARM_TAR="${ARM_BUNDLE_DIR}/${APP_NAME}_${VERSION}_aarch64.app.tar.gz"
  X64_TAR="${X64_BUNDLE_DIR}/${APP_NAME}_${VERSION}_x64.app.tar.gz"

  echo "==> Creating and signing macOS updater tarballs..."
  (cd "$ARM_BUNDLE_DIR" && tar -czf "$ARM_TAR" "${APP_NAME}.app")
  (cd "$X64_BUNDLE_DIR" && tar -czf "$X64_TAR" "${APP_NAME}.app")
  pnpm tauri signer sign --private-key "$TAURI_SIGNING_PRIVATE_KEY" \
    --password "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" "$ARM_TAR"
  pnpm tauri signer sign --private-key "$TAURI_SIGNING_PRIVATE_KEY" \
    --password "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" "$X64_TAR"

  ARM_SIG="$(cat "${ARM_TAR}.sig")"
  X64_SIG="$(cat "${X64_TAR}.sig")"

  # Stable names for download links (no version in filename)
  ARM_DMG_STABLE="/tmp/${APP_NAME}-macos-arm.dmg"
  X64_DMG_STABLE="/tmp/${APP_NAME}-macos-intel.dmg"
  cp "$ARM_DMG" "$ARM_DMG_STABLE"
  cp "$X64_DMG" "$X64_DMG_STABLE"

  UPLOAD_FILES+=("$ARM_DMG_STABLE" "$X64_DMG_STABLE" "$ARM_TAR" "${ARM_TAR}.sig" "$X64_TAR" "${X64_TAR}.sig")

  BASE_URL="https://github.com/${RELEASES_REPO}/releases/download/${TAG}"
  PLATFORM_ENTRIES+="    \"darwin-aarch64\": { \"signature\": \"${ARM_SIG}\", \"url\": \"${BASE_URL}/$(basename "$ARM_TAR")\" },"$'\n'
  PLATFORM_ENTRIES+="    \"darwin-x86_64\":  { \"signature\": \"${X64_SIG}\", \"url\": \"${BASE_URL}/$(basename "$X64_TAR")\" },"$'\n'

  echo "==> macOS build complete."
fi

# ── Linux build (via Docker when on macOS, native when on Linux) ──────────────

if [[ "$BUILD_LINUX" == "true" ]]; then
  LINUX_ARTIFACTS_DIR="/tmp/huxflux-linux-artifacts-${TAG}"
  rm -rf "$LINUX_ARTIFACTS_DIR" && mkdir -p "$LINUX_ARTIFACTS_DIR"

  if [[ "$HOST_OS" == "Darwin" ]]; then
    if ! command -v docker &>/dev/null; then
      echo "Error: Docker not found. Install Docker Desktop to build Linux on macOS." >&2
      echo "Or skip with --macos-only and run this script on a Linux machine for the Linux build." >&2
      exit 1
    fi

    echo "==> Building Docker image (cached after first run)..."
    docker build -t "$DOCKER_IMAGE" \
      -f "$REPO_ROOT/scripts/Dockerfile.linux-builder" \
      "$REPO_ROOT/scripts" \
      --quiet

    echo "==> Building Linux via Docker (Cargo cache persists in Docker volumes)..."
    docker run --rm \
      -v "$REPO_ROOT:/src:ro" \
      -v "huxflux-linux-workspace:/build" \
      -v "huxflux-linux-target:/build/apps/desktop/src-tauri/target" \
      -v "huxflux-cargo-registry:/root/.cargo/registry" \
      -v "huxflux-cargo-git:/root/.cargo/git" \
      -v "huxflux-pnpm-store:/root/.local/share/pnpm" \
      -v "$LINUX_ARTIFACTS_DIR:/artifacts" \
      -e "TAURI_SIGNING_PRIVATE_KEY=$TAURI_SIGNING_PRIVATE_KEY" \
      -e "TAURI_SIGNING_PRIVATE_KEY_PASSWORD=${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" \
      "$DOCKER_IMAGE" bash -c "
        set -euo pipefail
        source ~/.cargo/env

        echo '--- Syncing source ---'
        rsync -a --delete \
          --exclude='node_modules' \
          --exclude='.git' \
          --exclude='apps/desktop/dist' \
          /src/ /build/

        echo '--- Installing dependencies ---'
        cd /build
        pnpm install --no-frozen-lockfile

        echo '--- Building ---'
        cd apps/desktop
        pnpm tauri build

        echo '--- Copying artifacts ---'
        cp -r src-tauri/target/release/bundle /artifacts/bundle
      "

  else
    # Running natively on Linux
    cd "$REPO_ROOT/apps/desktop"
    echo "==> Building Linux (native)..."
    pnpm tauri build
    cp -r "$TARGET_DIR/release/bundle" "$LINUX_ARTIFACTS_DIR/bundle"
  fi

  APPIMAGE_SRC="$(find "$LINUX_ARTIFACTS_DIR/bundle/appimage" -name "*.AppImage" | head -1)"
  DEB_SRC="$(find "$LINUX_ARTIFACTS_DIR/bundle/deb" -name "*.deb" | head -1)"
  for f in "$APPIMAGE_SRC" "$DEB_SRC"; do
    [[ -n "$f" && -f "$f" ]] || { echo "Error: Linux artifact not found — build may have failed" >&2; exit 1; }
  done

  LINUX_TAR="$LINUX_ARTIFACTS_DIR/${APP_NAME}_${VERSION}_x86_64.AppImage.tar.gz"
  (cd "$LINUX_ARTIFACTS_DIR/bundle/appimage" && tar -czf "$LINUX_TAR" "$(basename "$APPIMAGE_SRC")")

  cd "$REPO_ROOT/apps/desktop"
  pnpm tauri signer sign --private-key "$TAURI_SIGNING_PRIVATE_KEY" \
    --password "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" "$LINUX_TAR"

  LINUX_SIG="$(cat "${LINUX_TAR}.sig")"

  APPIMAGE_STABLE="/tmp/${APP_NAME}-linux-x86_64.AppImage"
  DEB_STABLE="/tmp/${APP_NAME}-linux-amd64.deb"
  cp "$APPIMAGE_SRC" "$APPIMAGE_STABLE"
  cp "$DEB_SRC" "$DEB_STABLE"

  UPLOAD_FILES+=("$APPIMAGE_STABLE" "$DEB_STABLE" "$LINUX_TAR" "${LINUX_TAR}.sig")

  BASE_URL="https://github.com/${RELEASES_REPO}/releases/download/${TAG}"
  PLATFORM_ENTRIES+="    \"linux-x86_64\": { \"signature\": \"${LINUX_SIG}\", \"url\": \"${BASE_URL}/$(basename "$LINUX_TAR")\" },"$'\n'

  echo "==> Linux build complete."
fi

# ── Generate latest.json ──────────────────────────────────────────────────────

PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LATEST_JSON_FILE="/tmp/latest.json"

# Strip trailing comma from last entry
PLATFORM_ENTRIES="${PLATFORM_ENTRIES%,$'\n'}"$'\n'

cat > "$LATEST_JSON_FILE" <<JSON
{
  "version": "${VERSION}",
  "notes": "",
  "pub_date": "${PUB_DATE}",
  "platforms": {
${PLATFORM_ENTRIES}  }
}
JSON

# ── Publish release ───────────────────────────────────────────────────────────

echo "==> Publishing ${TAG} to ${RELEASES_REPO}..."
GITHUB_TOKEN="" gh auth switch --user AlexMartosP

RELEASE_EXISTS=false
GITHUB_TOKEN="" gh release view "$TAG" --repo "$RELEASES_REPO" &>/dev/null && RELEASE_EXISTS=true

if [[ "$RELEASE_EXISTS" == "false" ]]; then
  GITHUB_TOKEN="" gh release create "$TAG" \
    --repo "$RELEASES_REPO" \
    --title "Huxflux ${TAG}" \
    --notes "The macOS app is unsigned — right-click the .dmg → Open to bypass Gatekeeper." \
    "${UPLOAD_FILES[@]}" \
    "$LATEST_JSON_FILE"
else
  GITHUB_TOKEN="" gh release upload "$TAG" \
    --repo "$RELEASES_REPO" \
    --clobber \
    "${UPLOAD_FILES[@]}" \
    "$LATEST_JSON_FILE"
fi

rm -f "$LATEST_JSON_FILE"

echo ""
echo "✓ Released ${TAG} → https://github.com/${RELEASES_REPO}/releases/tag/${TAG}"
