#!/usr/bin/env bash
# Rebuild a Tauri AppImage in place without the libraries that must come from
# the host system.
#
# linuxdeploy bundles libwayland-* from the build machine. On distros with a
# newer Mesa (e.g. Ubuntu 26.04) the old copies make WebKit's web process abort
# with "Could not create default EGL display: EGL_BAD_PARAMETER", leaving the
# window blank. Every Wayland-capable system ships these libraries, so dropping
# them is safe.
#
# Reuses the AppImage's own runtime stub, so no extra tools are downloaded.
# Requires squashfs-tools. Run before signing: it rewrites the file.
#
# Usage: strip-appimage-libs.sh <path/to/App.AppImage>
set -euo pipefail

appimage="$(realpath "${1:?usage: $0 <AppImage>}")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# The squashfs payload starts where the runtime ELF ends: section header table
# offset + entry size * entry count (same computation as --appimage-offset).
read_le() { od -An -t "u$2" -j "$1" -N "$2" "$appimage" | tr -d ' '; }
offset=$(( $(read_le 40 8) + $(read_le 58 2) * $(read_le 60 2) ))
if [ "$(tail -c +"$((offset + 1))" "$appimage" | head -c 4)" != "hsqs" ]; then
  echo "error: no squashfs payload at offset $offset in $appimage" >&2
  exit 1
fi

head -c "$offset" "$appimage" > "$work/runtime"
unsquashfs -q -no-progress -o "$offset" -d "$work/root" "$appimage"

removed=$(find "$work/root" -name 'libwayland-*.so*' -print -delete | wc -l)
if [ "$removed" -eq 0 ]; then
  echo "No bundled libwayland libraries found; leaving $appimage untouched."
  exit 0
fi

mksquashfs "$work/root" "$work/payload.squashfs" \
  -root-owned -noappend -comp zstd -b 131072 -quiet -no-progress
cat "$work/runtime" "$work/payload.squashfs" > "$work/out.AppImage"
chmod 755 "$work/out.AppImage"
mv "$work/out.AppImage" "$appimage"
echo "Removed $removed bundled libwayland file(s) from $(basename "$appimage")."
