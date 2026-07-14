#!/bin/bash
# Install TV Time's Metro server as a macOS service (launchd LaunchAgent).
# Run this ON the Mac that should host the app 24/7:
#   cd ~/TV-Time/mobile && bash deploy/install-mac-service.sh
#
# The service starts at login, restarts automatically if it crashes, and
# serves the app to Expo Go at exp://<this-mac>.local:8090

set -euo pipefail

PORT=8090
LABEL="app.tvtime.metro"

REPO_MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it first: https://nodejs.org (or: brew install node)"
  exit 1
fi
NODE_BIN_DIR="$(dirname "$(command -v node)")"
HOSTNAME_LOCAL="$(scutil --get LocalHostName).local"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/$LABEL.plist"
LOG="$HOME/Library/Logs/tvtime-metro.log"

if [ ! -d "$REPO_MOBILE_DIR/node_modules" ]; then
  echo "→ Installing dependencies first (npm ci)…"
  (cd "$REPO_MOBILE_DIR" && npm ci)
fi

mkdir -p "$PLIST_DIR" "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>exec npx expo start --port $PORT --go</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO_MOBILE_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NODE_BIN_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>REACT_NATIVE_PACKAGER_HOSTNAME</key>
    <string>$HOSTNAME_LOCAL</string>
    <key>EXPO_NO_TELEMETRY</key>
    <string>1</string>
    <key>CI</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrPath</key>
  <string>$LOG</string>
</dict>
</plist>
EOF

# (Re)load the service.
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "✅ TV Time server installed and running."
echo
echo "   On your iPhone, open Expo Go and enter this URL (or scan the QR"
echo "   from the log a few seconds after startup):"
echo
echo "       exp://$HOSTNAME_LOCAL:$PORT"
echo
echo "   Log (includes the QR code):  tail -50 \"$LOG\""
echo "   Restart:  launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "   Stop:     launchctl bootout gui/$(id -u) \"$PLIST\""
echo
echo "   To keep it truly 24/7, also stop the Mac from sleeping:"
echo "       sudo pmset -a sleep 0"
echo "   and enable automatic login (System Settings → Users & Groups),"
echo "   since this service starts when you log in."
