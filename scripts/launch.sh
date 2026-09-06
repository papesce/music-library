#!/bin/bash
set -euo pipefail
# Music Library launcher — called by Music Library.app (hidden, no Terminal)
# Logs to /tmp/music-library.log, pidfile /tmp/music-library.pid
# Mirrors shoplist/scripts/launch-preview.sh pattern

DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="/tmp/music-library.log"
PIDFILE="/tmp/music-library.pid"
PORT="${PORT:-3055}"

# Ensure PATH includes Homebrew/node for GUI launch (do shell script has minimal PATH)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
# fnm/nvm/volta/asdf use ephemeral PATH not inherited by GUI (Finder/Launchpad)
if ! command -v node >/dev/null 2>&1; then
  if [ -d "$HOME/.local/share/fnm/node-versions" ]; then
    for d in "$HOME/.local/share/fnm/node-versions"/*/installation/bin; do
      [ -x "$d/node" ] && PATH="$d:$PATH" && break
    done
  fi
  if ! command -v node >/dev/null 2>&1 && command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash 2>/dev/null)" || true
  fi
  if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh" 2>/dev/null || true
  fi
  for p in "$HOME/.volta/bin" "$HOME/.asdf/shims" "$HOME/.local/bin" "$HOME/.bun/bin"; do
    [ -x "$p/node" ] && PATH="$p:$PATH" && break
  done
  if ! command -v node >/dev/null 2>&1; then
    LOGIN_NODE=$(bash -l -c 'which node' 2>/dev/null || zsh -l -c 'which node' 2>/dev/null || true)
    if [ -n "$LOGIN_NODE" ] && [ -x "$LOGIN_NODE" ]; then
      PATH="$(dirname "$LOGIN_NODE"):$PATH"
    fi
  fi
fi
# also ensure .whisper-venv bin on PATH
if [[ -d "$DIR/.whisper-venv/bin" ]]; then export PATH="$DIR/.whisper-venv/bin:$PATH"; fi

exec >>"$LOG" 2>&1
echo "=== Music Library launch $(date) ==="
echo "DIR=$DIR PORT=$PORT"

cd "$DIR"

BIN="$DIR/out/music-library"
DIST_SRC="$DIR/dist"
DIST_DST="$DIR/out/dist"

# Ensure dist exists next to binary (Bun compile fallback)
if [[ ! -d "$DIST_DST" && -d "$DIST_SRC" ]]; then
  cp -r "$DIST_SRC" "$DIST_DST" 2>/dev/null || true
fi

# Handle quarantine if needed
if [[ -f "$BIN" ]] && xattr -p com.apple.quarantine "$BIN" &>/dev/null; then
  xattr -d com.apple.quarantine "$BIN" 2>/dev/null || true
fi

# Kill stale on PORT if needed (check health first — don't kill if already healthy)
if lsof -ti :"$PORT" >/dev/null 2>&1; then
  if curl -sf "http://127.0.0.1:$PORT/api/config" >/dev/null 2>&1; then
    echo "Already running on :$PORT — reusing existing server"
    open "http://127.0.0.1:$PORT/" || true
    exit 0
  fi
  echo "Killing stale process on :$PORT"
  lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

# Prefer compiled binary, fallback to tsx
if [[ -x "$BIN" ]]; then
  echo "Starting via binary: $BIN"
  export MUSIC_DATA_DIR="${MUSIC_DATA_DIR:-$DIR/data}"
  PORT="$PORT" MUSIC_DATA_DIR="$MUSIC_DATA_DIR" nohup "$BIN" >>"$LOG" 2>&1 &
else
  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node not found and no binary at $BIN"
    osascript -e 'display alert "Music Library" message "Node.js not found and no binary at out/music-library. Run ./install.sh first." as critical' || true
    exit 1
  fi
  echo "Binary missing — starting via tsx server/index.ts"
  if [[ ! -d node_modules ]]; then
    echo "node_modules missing — running npm install..."
    npm install
  fi
  if [[ ! -d dist ]]; then
    echo "dist/ missing — running build..."
    npm run build || true
  fi
  export MUSIC_DATA_DIR="${MUSIC_DATA_DIR:-$DIR/data}"
  PORT="$PORT" nohup node --import tsx server/index.ts >>"$LOG" 2>&1 &
fi

PID=$!
echo "$PID" > "$PIDFILE"
echo "server PID=$PID (pidfile $PIDFILE) PORT=$PORT"

# Wait for server to be ready (up to 10s)
for i in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:$PORT/api/config" >/dev/null 2>&1; then
    echo "Server ready after $i tries"
    break
  fi
  sleep 0.5
done

open "http://127.0.0.1:$PORT/" || true
echo "Done."
