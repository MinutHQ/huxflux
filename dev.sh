#!/usr/bin/env bash
set -euo pipefail
set -m  # enable job control so background jobs get their own process group

PIDDIR="$HOME/.huxflux"
mkdir -p "$PIDDIR"

WEB_PID="$PIDDIR/web.pid"
SERVER_PID="$PIDDIR/server.pid"
WEB_LOG="$PIDDIR/web.log"
SERVER_LOG="$PIDDIR/server.log"

WEB_PORT=5173
SERVER_PORT=3002

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    echo "Killing processes on port $port..."
    echo "$pids" | xargs kill 2>/dev/null || true
  fi
}

check_deps() {
  if ! command -v pnpm &>/dev/null; then
    echo "pnpm not found. Install it first: https://pnpm.io/installation"
    exit 1
  fi

  echo "Installing dependencies..."
  pnpm install
}

start() {
  check_deps

  if [ -f "$WEB_PID" ] && kill -0 "$(cat "$WEB_PID")" 2>/dev/null; then
    echo "Already running. Use '$0 ps' to check status."
    return 1
  fi

  kill_port "$WEB_PORT"
  kill_port "$SERVER_PORT"

  echo "Starting web..."
  pnpm dev:web < /dev/null > "$WEB_LOG" 2>&1 &
  echo $! > "$WEB_PID"

  echo "Starting server..."
  pnpm dev:server < /dev/null > "$SERVER_LOG" 2>&1 &
  echo $! > "$SERVER_PID"

  echo "Started. Logs at $PIDDIR/*.log"
}

stop() {
  local stopped=0
  for name in web server; do
    pidfile="$PIDDIR/$name.pid"
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null
        echo "Stopped $name (pid $pid)"
      else
        echo "$name not running (stale pid)"
      fi
      rm -f "$pidfile"
      stopped=1
    fi
  done
  [ "$stopped" -eq 0 ] && echo "Nothing running."
}

ps_status() {
  local found=0
  for name in web server; do
    pidfile="$PIDDIR/$name.pid"
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        echo "$name: running (pid $pid)"
      else
        echo "$name: dead (stale pid $pid)"
        rm -f "$pidfile"
      fi
      found=1
    fi
  done
  [ "$found" -eq 0 ] && echo "Nothing running."
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; start ;;
  ps)      ps_status ;;
  *)       echo "Usage: $0 {start|stop|restart|ps}" ;;
esac
