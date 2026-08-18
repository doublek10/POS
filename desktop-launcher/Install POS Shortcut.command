#!/bin/bash
# ============================================================
#  POS Till — one-click setup
#  Double-click this file once (Finder: right-click > Open the
#  first time, to clear the unsigned-script warning). It creates
#  a "POS Till" icon on your Desktop. After that you never need
#  this file again — just use the Desktop icon.
# ============================================================

# --- EDIT THIS LINE to your real POS address before installing ---
POS_URL="http://localhost:3000"

# Uncomment to also open the POS automatically at login:
# AUTOSTART_FLAG="--autostart"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/install-mac.sh" "$POS_URL" $AUTOSTART_FLAG

echo ""
echo "Setup complete. Look for the 'POS Till' icon on your Desktop."
read -p "Press Enter to close..."
