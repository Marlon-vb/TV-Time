#!/bin/bash
# Pull the latest TV Time code and restart the 24/7 service.
#   cd ~/TV-Time/mobile && bash deploy/update.sh

set -euo pipefail

REPO_MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="app.tvtime.metro"

cd "$REPO_MOBILE_DIR"
git checkout -- package-lock.json 2>/dev/null || true
git pull
npm ci

if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/$LABEL"
  echo "✅ Updated and restarted the TV Time server."
else
  echo "✅ Updated. (Service not installed — run deploy/install-mac-service.sh to set it up.)"
fi
