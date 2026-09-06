#!/bin/bash
set -euo pipefail
PORT="${PORT:-3055}"
LOG="/tmp/music-library.log"
PIDFILE="/tmp/music-library.pid"

# Try graceful quit via API first (like shoplist does)
if curl -sf -X POST "http://127.0.0.1:$PORT/api/quit" >/dev/null 2>&1; then
  echo "→ Quit via /api/quit on :$PORT ..."
  sleep 0.8
  echo "✔ Stopped."
  rm -f "$PIDFILE"
  exit 0
fi
if curl -sf -X POST "http://127.0.0.1:$PORT/api/shutdown" >/dev/null 2>&1; then
  echo "→ Quit via /api/shutdown on :$PORT ..."
  sleep 0.8
  rm -f "$PIDFILE"
  exit 0
fi

# Fallback: kill by pidfile
if [[ -f "$PIDFILE" ]]; then
  PID=$(cat "$PIDFILE" 2>/dev/null || true)
  if [[ -n "${PID:-}" ]] && kill -0 "$PID" 2>/dev/null; then
    echo "→ Killing pidfile PID $PID ..."
    kill "$PID" 2>/dev/null || true
    sleep 0.5
    kill -9 "$PID" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
fi

# Fallback: lsof on port
if lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "→ Killing process on :$PORT ..."
  lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 0.5
  echo "✔ Stopped. (log: $LOG)"
else
  # last resort: pkill binary
  if pkill -f "out/music-library" 2>/dev/null; then
    echo "✔ Stopped via pkill."
  else
    echo "No server running on :$PORT"
  fi
fi
