#!/bin/bash
# POS Till Launcher (macOS)
# Edit POS_URL below to point at your deployment, then double-click
# this file in Finder (or run install-mac.sh to set it up properly).
POS_URL="http://localhost:3000"

open -na "Microsoft Edge" --args --app="$POS_URL"
