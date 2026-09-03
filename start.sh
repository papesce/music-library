#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.whisper-venv"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}▶${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✘${NC} $*" >&2; }

# ensures local venv bin is on PATH for whisper
ensure_path() {
  if [[ -x "$VENV_DIR/bin/whisper" ]]; then
    export PATH="$VENV_DIR/bin:$PATH"
  fi
}

check_ffmpeg() {
  if command -v ffmpeg &>/dev/null && command -v ffprobe &>/dev/null; then
    info "ffmpeg OK — $(ffmpeg -version | head -n1)"
    return 0
  fi
  warn "ffmpeg/ffprobe not found — needed for audio split + Whisper"
  if [[ "$OSTYPE" == "darwin"* ]] && command -v brew &>/dev/null; then
    warn "Install with: brew install ffmpeg"
    if [[ "${AUTO_INSTALL:-0}" == "1" ]]; then
      info "AUTO_INSTALL=1 — running brew install ffmpeg..."
      brew install ffmpeg
    fi
  elif command -v apt-get &>/dev/null; then
    warn "Install with: sudo apt-get install ffmpeg"
  fi
  return 1
}

check_node() {
  if ! command -v node &>/dev/null; then
    err "node not found — install Node 22+ (https://nodejs.org or brew install node)"
    return 1
  fi
  info "node OK — $(node -v)"
  if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
    info "Installing npm dependencies..."
    npm --prefix "$SCRIPT_DIR" install
  fi
}

check_whisper() {
  ensure_path
  if command -v whisper &>/dev/null; then
    info "whisper OK — $(whisper --help 2>&1 | head -n1) ($(command -v whisper))"
    return 0
  fi
  warn "whisper CLI not found — needed for local synced-lyrics transcription (LRClib works without it)"
  echo "  Will auto-setup into $VENV_DIR on next run (or run ./start.sh --setup)"
  return 1
}

setup_whisper() {
  ensure_path
  if command -v whisper &>/dev/null; then
    info "whisper already available — $(command -v whisper)"
    return 0
  fi
  if ! command -v python3 &>/dev/null; then
    err "python3 not found — install Python 3.11+ to use Whisper (or use LRClib-only mode)"
    return 1
  fi
  info "Setting up Whisper (openai-whisper, base model ~140MB on first use)..."
  if [[ ! -d "$VENV_DIR" ]]; then
    info "Creating venv at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
  fi
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  pip install --upgrade pip --quiet
  pip install --quiet openai-whisper
  # verify
  if command -v whisper &>/dev/null; then
    info "whisper installed — $(whisper --version 2>&1 || whisper --help 2>&1 | head -n1)"
    info "First transcription will download base model (~140MB) to ~/.cache/whisper"
  else
    err "whisper install failed"
    return 1
  fi
  ensure_path
}

cmd_help() {
  cat <<EOF
Usage: ./start.sh [command] [options]

Commands:
  dev         Install deps if needed + start dev server (default)
  start       Build + start production server
  --setup     Only install/setup deps (node_modules + ffmpeg check + whisper venv)
  --check     Only check deps (no install, no start)
  --help      Show this help

Env:
  AUTO_INSTALL=1  Auto brew-install ffmpeg if missing (macOS)

What it does:
  1. Checks node + installs node_modules if missing
  2. Checks ffmpeg/ffprobe (warns, or brew installs with AUTO_INSTALL=1)
  3. Checks whisper CLI — if missing, creates .whisper-venv and pip-installs openai-whisper
     (Node server auto-prepends .whisper-venv/bin to PATH, so no manual PATH needed)
  4. Starts the app (npm run dev or npm run build && npm start)

Whisper is optional: LRClib lookup works without it. Whisper enables offline
transcription when LRClib has no match. Model 'base' downloads on first transcribe.
EOF
}

cmd_check() {
  local ok=0
  check_node || ok=1
  check_ffmpeg || ok=1
  check_whisper || true
  if [[ $ok -eq 0 ]]; then
    info "All checks passed"
  else
    warn "Some checks failed — see above"
  fi
}

cmd_setup() {
  check_node
  check_ffmpeg || true
  setup_whisper || true
  info "Setup done — run ./start.sh dev to start"
}

cmd_dev() {
  check_node
  check_ffmpeg || true
  ensure_path
  if ! command -v whisper &>/dev/null; then
    warn "whisper not installed — auto-setting up..."
    setup_whisper || warn "Continuing without whisper (LRClib still works)"
    ensure_path
  fi
  info "Starting dev — http://localhost:3055 (api) + http://localhost:5173 (vite)"
  # ensure venv bin stays on PATH for server child processes
  export PATH="$VENV_DIR/bin:$PATH"
  exec npm --prefix "$SCRIPT_DIR" run dev
}

cmd_start() {
  check_node
  check_ffmpeg || true
  ensure_path
  if ! command -v whisper &>/dev/null; then
    warn "whisper not installed — auto-setting up..."
    setup_whisper || warn "Continuing without whisper"
    ensure_path
  fi
  info "Building + starting production..."
  npm --prefix "$SCRIPT_DIR" run build
  export PATH="$VENV_DIR/bin:$PATH"
  exec npm --prefix "$SCRIPT_DIR" start
}

COMMAND="${1:-dev}"
case "$COMMAND" in
  --help|-h|help) cmd_help ;;
  --check|check)  cmd_check ;;
  --setup|setup)  cmd_setup ;;
  dev)            cmd_dev ;;
  start)          cmd_start ;;
  *)
    err "Unknown command: $COMMAND"
    cmd_help
    exit 1
    ;;
esac
