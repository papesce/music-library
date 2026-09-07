#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$SCRIPT_DIR"
OUT_DIR="$REPO_DIR/out"
APP_NAME="Music Library"
BIN_NAME="music-library"
BIN_PATH="$OUT_DIR/$BIN_NAME"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${GREEN}▶${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

WITH_COMMAND=0
for arg in "$@"; do
  case "$arg" in
    --with-command|--command) WITH_COMMAND=1 ;;
    --help|-h) echo "Usage: $0 [--with-command]  (default: .app only; --with-command also creates .command launcher)"; exit 0 ;;
    *) echo -e "${RED}Unknown option: $arg${NC}"; exit 1 ;;
  esac
done

if [[ ! -x "$BIN_PATH" ]]; then
  echo -e "${RED}✘ Binary not found: $BIN_PATH${NC}"
  echo "  Run first: ./install.sh  (or npm run build:bin)"
  exit 1
fi

# 1. Create .command launcher (opt-in via --with-command; .app is primary)
COMMAND_PATH="$OUT_DIR/${APP_NAME}.command"
if [[ "$WITH_COMMAND" -eq 1 ]]; then
cat > "$COMMAND_PATH" <<EOS
#!/bin/bash
# Double-click to start Music Library — auto-opens http://localhost:3055
REPO_DIR="$REPO_DIR"
BIN="\$REPO_DIR/out/music-library"
DIST="\$REPO_DIR/out/dist"

# Handle quarantine if needed
if xattr -p com.apple.quarantine "\$BIN" &>/dev/null; then
  xattr -d com.apple.quarantine "\$BIN" 2>/dev/null || true
fi

# If dist missing next to binary, ensure it exists (copy from repo dist)
if [[ ! -d "\$REPO_DIR/out/dist" && -d "\$REPO_DIR/dist" ]]; then
  cp -r "\$REPO_DIR/dist" "\$REPO_DIR/out/dist" 2>/dev/null || true
fi

echo "Starting Music Library on http://localhost:3055 ..."
echo "Close this window to stop (or Ctrl+C)"
echo ""
# PORT can be changed: PORT=3056 ./Music\ Library.command
PORT=\${PORT:-3055} "\$BIN"
EOS
chmod +x "$COMMAND_PATH"
info "Created $COMMAND_PATH (double-click in Finder)"
else
  info "Skipping .command launcher (use --with-command to create it)"
fi

# 2. Create .app bundle via AppleScript applet (stay-open, like shoplist/Shoplist.app)
#    This keeps the icon in Dock and enables Cmd+Q / right-click Quit → runs stop.sh
APP_BUNDLE="$OUT_DIR/${APP_NAME}.app"
rm -rf "$APP_BUNDLE"

cat > /tmp/music-library-applet.applescript <<APPLESCRIPT
on run
  -- launch server hidden; absolute path embedded at build time (re-run script after moving repo)
  -- single opener is scripts/launch.sh (waits for health check, opens http://localhost:3055)
  do shell script quoted form of POSIX path of "${REPO_DIR}/scripts/launch.sh" & " 2>&1 &"
end run
on quit
  -- stop server when app is quit (Cmd+Q or Quit from Dock)
  try
    do shell script quoted form of POSIX path of "${REPO_DIR}/scripts/stop.sh" & " &> /dev/null"
  end try
  continue quit
end quit
on open location f
  run
end open
on idle
  -- keep app alive so it stays in Dock for Quit; check server health
  return 3600
end idle
APPLESCRIPT

echo "→ Compiling AppleScript applet (stay-open) ..."
osacompile -s -o "$APP_BUNDLE" /tmp/music-library-applet.applescript 2>&1

# osacompile creates its own Info.plist; merge our values (like shoplist)
/usr/libexec/PlistBuddy -c "Set :CFBundleName ${APP_NAME}" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${APP_NAME}" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string ${APP_NAME}" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.music-library.app" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.music-library.app" "$APP_BUNDLE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile AppIcon" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$APP_BUNDLE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Delete :LSUIElement" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool false" "$APP_BUNDLE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconName AppIcon" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleIconName string AppIcon" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
# Ensure stay-open
/usr/libexec/PlistBuddy -c "Delete :OSAAppletStayOpen" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :OSAAppletStayOpen bool true" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
# Show startup screen off (like shoplist)
 /usr/libexec/PlistBuddy -c "Set :OSAAppletShowStartupScreen bool false" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :OSAAppletShowStartupScreen bool false" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true

chmod +x "$APP_BUNDLE/Contents/MacOS/applet" 2>/dev/null || true

# Icon: use custom icon.png if present, else generate music-note icns via built-in tools
ICON_ICNS="$APP_BUNDLE/Contents/Resources/AppIcon.icns"
ICONSET="/tmp/music-library.iconset"

create_fallback_icon() {
  # Try to generate a music-note PNG with Swift/AppKit (no Pillow/magick needed), then convert to icns
  local tmp_png="/tmp/music-library-icon.png"
  # Generate 1024x1024 PNG with rounded rect + music note using Swift
  swift - <<'SWIFT' "$tmp_png" 2>/dev/null
import AppKit
let size = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
// Background: dark rounded rect
let bgRect = NSRect(x: 0, y: 0, width: size, height: size)
let bgPath = NSBezierPath(roundedRect: bgRect, xRadius: 220, yRadius: 220)
NSColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1).setFill()
bgPath.fill()
// Music note: use SF Symbol or unicode
let note = "♪"
let style = NSMutableParagraphStyle(); style.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 620, weight: .regular),
  .foregroundColor: NSColor.white,
  .paragraphStyle: style
]
let str = NSAttributedString(string: note, attributes: attrs)
let textSize = str.size()
let textRect = NSRect(x: (size - Int(textSize.width))/2, y: (size - Int(textSize.height))/2 - 20, width: Int(textSize.width), height: Int(textSize.height))
str.draw(in: textRect)
img.unlockFocus()
guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
let out = CommandLine.arguments.dropFirst().first ?? "/tmp/music-library-icon.png"
try! png.write(to: URL(fileURLWithPath: out))
SWIFT
  if [[ -f "$tmp_png" ]]; then
    echo "$tmp_png"
    return 0
  fi
  return 1
}

if [[ -f "$REPO_DIR/icon.png" ]]; then
  rm -rf "$ICONSET"; mkdir -p "$ICONSET"
  sips -z 1024 1024 "$REPO_DIR/icon.png" --out "$ICONSET/icon_512x512@2x.png" &>/dev/null || cp "$REPO_DIR/icon.png" "$ICONSET/icon_512x512.png"
  for sz in 16 32 64 128 256 512; do
    sips -z $sz $sz "$REPO_DIR/icon.png" --out "$ICONSET/icon_${sz}x${sz}.png" &>/dev/null || true
    sips -z $((sz*2)) $((sz*2)) "$REPO_DIR/icon.png" --out "$ICONSET/icon_${sz}x${sz}@2x.png" &>/dev/null || true
  done
  iconutil -c icns "$ICONSET" -o "$ICON_ICNS" 2>/dev/null || true
  rm -rf "$ICONSET"
elif command -v iconutil &>/dev/null; then
  GEN_PNG="$(create_fallback_icon || true)"
  if [[ -n "${GEN_PNG:-}" && -f "$GEN_PNG" ]]; then
    rm -rf "$ICONSET"; mkdir -p "$ICONSET"
    for sz in 16 32 64 128 256 512; do
      sips -z $sz $sz "$GEN_PNG" --out "$ICONSET/icon_${sz}x${sz}.png" &>/dev/null || true
      sips -z $((sz*2)) $((sz*2)) "$GEN_PNG" --out "$ICONSET/icon_${sz}x${sz}@2x.png" &>/dev/null || true
    done
    # Ensure 1024
    cp "$GEN_PNG" "$ICONSET/icon_512x512@2x.png" 2>/dev/null || true
    iconutil -c icns "$ICONSET" -o "$ICON_ICNS" 2>/dev/null || true
    rm -rf "$ICONSET" "$GEN_PNG"
  else
    # Last resort: copy system music icon
    cp "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/MusicFolderIcon.icns" "$ICON_ICNS" 2>/dev/null || true
  fi
fi

# If still no icns, copy system icon as fallback; if that also fails, remove icon key
if [[ ! -f "$ICON_ICNS" ]]; then
  cp "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/MusicFolderIcon.icns" "$ICON_ICNS" 2>/dev/null || true
fi
if [[ ! -f "$ICON_ICNS" ]]; then
  plutil -remove CFBundleIconFile "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
fi

# 3. Create Quit helper (stops server via /api/shutdown, fallback pkill)
QUIT_COMMAND="$OUT_DIR/Quit Music Library.command"
cat > "$QUIT_COMMAND" <<'EOS'
#!/bin/bash
PORT="${PORT:-3055}"
# try graceful shutdown via API first (works even if launched via .app nohup)
if curl -sf -X POST "http://localhost:$PORT/api/shutdown" >/dev/null 2>&1; then
  echo "Quit requested — server shutting down on port $PORT"
  sleep 1
  exit 0
fi
# fallback: kill by binary path
if pkill -f "out/music-library" 2>/dev/null; then
  echo "Server stopped (pkill)"
  exit 0
fi
# last resort: any process on port
lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
if curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; then
  echo "No server found on port $PORT"
  exit 1
else
  echo "Server stopped"
fi
EOS
chmod +x "$QUIT_COMMAND"
xattr -dr com.apple.quarantine "$QUIT_COMMAND" 2>/dev/null || true
info "Created $QUIT_COMMAND (double-click to quit)"

# Clear quarantine, touch (like shoplist)
xattr -cr "$APP_BUNDLE" 2>/dev/null || true
touch "$APP_BUNDLE" 2>/dev/null || true

info "Created $APP_BUNDLE (double-click to launch) — stay-open, Quit from Dock/Cmd+Q"
echo ""
echo "Install options:"
if [[ "$WITH_COMMAND" -eq 1 ]]; then
  echo "  1. Run from out/: open \"$APP_BUNDLE\"  or  open \"$COMMAND_PATH\""
else
  echo "  1. Run from out/: open \"$APP_BUNDLE\""
fi
echo "  2. Drag to Desktop: cp -r \"$APP_BUNDLE\" ~/Desktop/"
echo "  3. Drag to Dock: drag \"$APP_BUNDLE\" to Dock (bottom bar)"
echo "  4. Add to Applications: cp -r \"$APP_BUNDLE\" /Applications/  (may need sudo)"
echo ""
echo "To stop server: Quit from Dock/Cmd+Q, or: curl -X POST http://localhost:3055/api/shutdown  or  pkill -f \"out/music-library\"  (or double-click \"Quit Music Library.command\" if created)"
echo "Logs: tail -f /tmp/music-library.log"
