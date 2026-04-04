#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  echo ""
  echo "Shutting down..."
  kill 0 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

if ! command -v pnpm &>/dev/null; then
  echo "pnpm not found. Install it first: https://pnpm.io/installation"
  exit 1
fi

# Kill anything already on the default dev ports (but not browsers)
for port in 5173 3002; do
  for pid in $(lsof -ti :"$port" 2>/dev/null); do
    cmd=$(ps -p "$pid" -o comm= 2>/dev/null || true)
    case "$cmd" in
      *firefox*|*Firefox*) ;;
      *) kill -9 "$pid" 2>/dev/null || true ;;
    esac
  done
done

echo "Installing dependencies..."
pnpm install --silent

# Build tokens once before starting
pnpm --filter @hive/tokens build

# Start web (vite)
pnpm dev:web 2>&1 | sed "s/^/[web] /" &

# Start server (tsx watch)
pnpm dev:server 2>&1 | sed "s/^/[server] /" &

# Watch tokens source and rebuild on change
node -e "
  const fs = require('fs');
  const { execSync } = require('child_process');
  let timer;
  fs.watch('packages/tokens/src/tokens.ts', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const out = execSync('pnpm --filter @hive/tokens build', { encoding: 'utf8' });
        process.stdout.write(out.split('\n').map(l => '[tokens] ' + l).join('\n'));
      } catch (e) {
        process.stderr.write('[tokens] build failed\n');
      }
    }, 100);
  });
" &

wait
