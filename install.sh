#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN_BIN="$HOME/.bun/bin/bun"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${GREEN}▶${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✘${NC} $*" >&2; }

usage() {
  cat <<EOF
Usage: ./install.sh [options]

Builds standalone binary (Option C) — no Node needed to run after.

Options:
  --clean     rm -rf dist out node_modules before build
  --all       cross-compile macOS/Linux/Windows (build:bin:all)
  --no-bun    skip Bun install (use existing bun)
  --desktop   also create Desktop icon (out/Music Library.app + .command)
  --help      show this help

What it does:
  1. Checks node 22+ and installs Bun if missing (~/.bun/bin/bun)
  2. npm ci (or npm install)
  3. npm run build (Vite → dist/)
  4. bun build --compile server/index.ts → out/music-library + out/dist
  5. Verifies binary serves frontend + API

Env:
  PORT=3055          port for verify step (default 3057 for test)
  NO_OPEN=1          disables auto-open during verify
  MUSIC_DATA_DIR     custom data dir (default ./data)

After: run ./out/music-library  (or double-click)
EOF
}

CLEAN=0; ALL=0; NO_BUN=0; DESKTOP=0
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=1 ;;
    --all) ALL=1 ;;
    --no-bun) NO_BUN=1 ;;
    --desktop) DESKTOP=1 ;;
    --help|-h) usage; exit 0 ;;
    *) err "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

# 1. Checks
if ! command -v node &>/dev/null; then
  err "node not found — install Node 22+ (https://nodejs.org or brew install node)"
  exit 1
fi
info "node OK — $(node -v) ($(command -v node))"

if [[ "$NO_BUN" -eq 0 ]]; then
  BUN_CMD=""
  if [[ -x "$BUN_BIN" ]]; then BUN_CMD="$BUN_BIN"
  elif command -v bun &>/dev/null; then BUN_CMD="$(command -v bun)"
  fi
  if [[ -z "$BUN_CMD" ]]; then
    info "Installing Bun to $BUN_BIN ..."
    curl -fsSL https://bun.sh/install | bash
    BUN_CMD="$BUN_BIN"
    if [[ ! -x "$BUN_CMD" ]]; then
      err "Bun install failed — install manually: curl -fsSL https://bun.sh/install | bash"
      exit 1
    fi
  fi
  info "bun OK — $($BUN_CMD --version) ($BUN_CMD)"
  # ensure PATH for npm scripts that use ~/.bun/bin/bun
  export PATH="$HOME/.bun/bin:$PATH"
else
  BUN_CMD="${BUN_BIN:-$(command -v bun || true)}"
  if ! command -v bun &>/dev/null && [[ ! -x "$BUN_CMD" ]]; then
    err "bun not found (--no-bun set but no bun in PATH)"
    exit 1
  fi
fi

if ! command -v ffmpeg &>/dev/null || ! command -v ffprobe &>/dev/null; then
  warn "ffmpeg/ffprobe not found — waveform/peaks/split will be degraded"
  if [[ "$OSTYPE" == "darwin"* ]] && command -v brew &>/dev/null; then
    warn "Install with: brew install ffmpeg  (or AUTO_INSTALL=1 ./install.sh to auto-install)"
    if [[ "${AUTO_INSTALL:-0}" == "1" ]]; then
      info "AUTO_INSTALL=1 — brew install ffmpeg ..."
      brew install ffmpeg
    fi
  elif command -v apt-get &>/dev/null; then
    warn "Install with: sudo apt-get install ffmpeg"
  fi
else
  info "ffmpeg OK — $(ffmpeg -version 2>&1 | head -n1)"
fi

# 2. Clean if requested
if [[ "$CLEAN" -eq 1 ]]; then
  info "Cleaning dist out node_modules ..."
  rm -rf "$SCRIPT_DIR/dist" "$SCRIPT_DIR/out" "$SCRIPT_DIR/node_modules"
fi

# 3. Install deps
if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  info "Installing npm dependencies (npm ci) ..."
  if [[ -f "$SCRIPT_DIR/package-lock.json" ]]; then
    npm --prefix "$SCRIPT_DIR" ci
  else
    npm --prefix "$SCRIPT_DIR" install
  fi
else
  info "node_modules exists — skipping install (use --clean to force)"
fi

# 4. Build
info "Building frontend + binary ..."
if [[ "$ALL" -eq 1 ]]; then
  npm --prefix "$SCRIPT_DIR" run build:bin:all
else
  npm --prefix "$SCRIPT_DIR" run build:bin
fi

# 5. Verify
BIN="$SCRIPT_DIR/out/music-library"
if [[ ! -x "$BIN" ]]; then
  # fallback name on mac build
  BIN="$(ls -t "$SCRIPT_DIR/out"/music-library* 2>/dev/null | head -1 || true)"
fi
if [[ -z "${BIN:-}" ]] || [[ ! -x "$BIN" ]]; then
  err "Binary not found in out/ — build failed"
  ls -lh "$SCRIPT_DIR/out/" 2>&1 || true
  exit 1
fi
info "Binary OK — $(ls -lh "$BIN" | awk '{print $9, $5}')"

# Quick smoke test (port 3057 to avoid clashing with dev)
TEST_PORT="${PORT:-3057}"
info "Smoke test on port $TEST_PORT ..."
set +e
NO_OPEN=1 PORT="$TEST_PORT" "$BIN" &
PID=$!
sleep 2
if ! kill -0 "$PID" 2>/dev/null; then
  err "Binary exited immediately — check logs above"
  exit 1
fi
PASS=0
if curl -sf "http://localhost:$TEST_PORT/" 2>/dev/null | grep -q "Music Library\|<!doctype" ; then
  info "Frontend OK — http://localhost:$TEST_PORT/"
  PASS=$((PASS+1))
else
  warn "Frontend check failed (dist may be missing next to binary)"
  curl -s "http://localhost:$TEST_PORT/" 2>&1 | head -20
fi
if curl -sf "http://localhost:$TEST_PORT/api/library" 2>/dev/null | grep -q "filePath\|id" ; then
  info "API OK — http://localhost:$TEST_PORT/api/library"
  PASS=$((PASS+1))
else
  warn "API check failed"
fi
kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null || true
set -e

if [[ "$PASS" -lt 2 ]]; then
  warn "Smoke test partial — binary exists but checks failed (see above)"
else
  info "Smoke test passed"
fi

if [[ "$DESKTOP" -eq 1 || "${CREATE_DESKTOP:-0}" == "1" ]]; then
  info "Creating desktop icon ..."
  if [[ -x "$SCRIPT_DIR/scripts/create-desktop-icon.sh" ]]; then
    "$SCRIPT_DIR/scripts/create-desktop-icon.sh" || warn "Failed to create desktop icon"
  fi
fi

echo ""
echo -e "${CYAN}Done.${NC} Run it:"
echo -e "  ${GREEN}./out/music-library${NC}           # → http://localhost:3055 (auto-opens browser)"
echo -e "  ${GREEN}open \"out/Music Library.app\"${NC}  # double-click app icon (macOS)"
echo -e "  ${GREEN}open \"out/Music Library.command\"${NC} # double-click command"
echo -e "  ${GREEN}NO_OPEN=1 PORT=3055 ./out/music-library${NC}  # without auto-open"
echo ""
if [[ -d "$SCRIPT_DIR/out/Music Library.app" ]]; then
  echo -e "Desktop icon: ${YELLOW}out/Music Library.app${NC} — drag to ${YELLOW}Desktop${NC} or ${YELLOW}Dock${NC}"
  echo -e "  cp -r \"out/Music Library.app\" ~/Desktop/  && open ~/Desktop/\"Music Library.app\""
fi
echo -e "Distribution: zip ${YELLOW}out/music-library${NC} + ${YELLOW}out/dist/${NC} (+ ${YELLOW}Music Library.app${NC}) together."
echo -e "macOS unsigned: ${YELLOW}xattr -dr com.apple.quarantine \"out/Music Library.app\"${NC} (or Right-click → Open)"
echo -e "Data: ${YELLOW}./data/music.db${NC} (override: MUSIC_DATA_DIR=/path ./out/music-library)"
echo -e "Update: ${YELLOW}git pull && ./install.sh${NC}"
