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

if [[ ! -x "$BIN_PATH" ]]; then
  echo -e "${RED}✘ Binary not found: $BIN_PATH${NC}"
  echo "  Run first: ./install.sh  (or npm run build:bin)"
  exit 1
fi

# 1. Create .command launcher (simplest, always works)
COMMAND_PATH="$OUT_DIR/${APP_NAME}.command"
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

# 2. Create .app bundle (proper macOS app icon)
APP_BUNDLE="$OUT_DIR/${APP_NAME}.app"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"

# Launcher inside app — keeps terminal hidden, opens browser via binary's auto-open
cat > "$APP_BUNDLE/Contents/MacOS/${APP_NAME}" <<'EOS'
#!/bin/bash
# Resolve repo dir: app is at out/Music Library.app → repo is 1 level up from out
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# When moved to Desktop, APP_DIR is ~/Desktop/Music Library.app/Contents — find repo via stored path
REPO_PLIST="$APP_DIR/Resources/repo.path"
if [[ -f "$REPO_PLIST" ]]; then
  REPO_DIR="$(cat "$REPO_PLIST")"
else
  # Fallback: assume relative to app bundle (when copied with out/)
  REPO_DIR="$(cd "$APP_DIR/../.." && pwd)"
  if [[ ! -x "$REPO_DIR/out/music-library" ]]; then
    REPO_DIR="$(cd "$APP_DIR/../../.." && pwd)"
  fi
fi
BIN="$REPO_DIR/out/music-library"
DIST_SRC="$REPO_DIR/dist"
DIST_DST="$REPO_DIR/out/dist"

# Ensure dist exists next to binary
if [[ ! -d "$DIST_DST" && -d "$DIST_SRC" ]]; then
  cp -r "$DIST_SRC" "$DIST_DST" 2>/dev/null || true
fi

# Clear quarantine on first launch
if xattr -p com.apple.quarantine "$BIN" &>/dev/null; then
  xattr -d com.apple.quarantine "$BIN" 2>/dev/null || true
fi

# Start binary detached — ensure correct cwd and data dir when launched from Finder (cwd is "/")
cd "$REPO_DIR" 2>/dev/null || true
export MUSIC_DATA_DIR="$REPO_DIR/data"
# Ensure dist exists next to binary (already handled above)
PORT="${PORT:-3055}" MUSIC_DATA_DIR="$MUSIC_DATA_DIR" nohup "$BIN" > /tmp/music-library.log 2>&1 &
sleep 1
# Fallback open if binary didn't (NO_OPEN set)
if ! curl -sf "http://localhost:${PORT:-3055}/" &>/dev/null; then
  sleep 1
fi
open "http://localhost:${PORT:-3055}" 2>/dev/null || true
EOS
chmod +x "$APP_BUNDLE/Contents/MacOS/${APP_NAME}"

# Store repo path for when app is moved to Desktop
echo "$REPO_DIR" > "$APP_BUNDLE/Contents/Resources/repo.path"

# Minimal Info.plist
cat > "$APP_BUNDLE/Contents/Info.plist" <<EOS
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>com.music-library.app</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>${APP_NAME}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSUIElement</key><false/>
</dict>
</plist>
EOS

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

# Remove quarantine from app bundle itself
xattr -dr com.apple.quarantine "$APP_BUNDLE" 2>/dev/null || true

info "Created $APP_BUNDLE (double-click to launch)"
echo ""
echo "Install options:"
echo "  1. Run from out/: open \"$APP_BUNDLE\"  or  open \"$COMMAND_PATH\""
echo "  2. Drag to Desktop: cp -r \"$APP_BUNDLE\" ~/Desktop/"
echo "  3. Drag to Dock: drag \"$APP_BUNDLE\" to Dock (bottom bar)"
echo "  4. Add to Applications: cp -r \"$APP_BUNDLE\" /Applications/  (may need sudo)"
echo ""
echo "To stop server: pkill -f \"out/music-library\"  or kill via Activity Monitor (search music-library)"
echo "Logs: tail -f /tmp/music-library.log"
