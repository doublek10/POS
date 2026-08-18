#!/bin/bash
# Installs the POS Till launcher on macOS:
#   - Writes the given URL into launch-pos-mac.command
#   - Copies it to the Desktop as "POS Till.command"
#   - With --autostart, registers it as a login item so it opens
#     automatically when the till machine logs in.
#
# Usage:
#   ./install-mac.sh "https://pos.yourbusiness.com"
#   ./install-mac.sh "https://pos.yourbusiness.com" --autostart

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POS_URL="${1:-http://localhost:3000}"
AUTOSTART_FLAG="$2"

LAUNCHER="$SCRIPT_DIR/launch-pos-mac.command"
DEST="$HOME/Desktop/POS Till.command"

sed -i '' "s|^POS_URL=.*|POS_URL=\"$POS_URL\"|" "$LAUNCHER"
cp "$LAUNCHER" "$DEST"
chmod +x "$DEST"

echo "Created: $DEST"

if [ "$AUTOSTART_FLAG" = "--autostart" ]; then
  osascript -e "tell application \"System Events\" to make login item at end with properties {path:\"$DEST\", hidden:false}"
  echo "Added as a login item — the POS will open automatically at login."
fi

echo "Done. Double-click 'POS Till' on the Desktop to launch (first run: right-click > Open, to clear macOS's unsigned-script warning)."
