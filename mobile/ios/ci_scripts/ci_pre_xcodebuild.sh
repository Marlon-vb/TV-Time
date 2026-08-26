#!/bin/sh
set -e

# Give every Xcode Cloud build a unique, always-increasing build number so
# App Store Connect never rejects it for a stale version. CI_BUILD_NUMBER
# increments per workflow run; the +100 offset clears the older EAS uploads
# (which had reached build 8).
BUILD=$(( ${CI_BUILD_NUMBER:-1} + 100 ))

cd "$CI_PRIMARY_REPOSITORY_PATH/mobile/ios"

# apple-generic versioning: bumps CURRENT_PROJECT_VERSION (which the widget
# derives its CFBundleVersion from) and CFBundleVersion in the Info.plists,
# keeping the app and widget in lockstep.
agvtool new-version -all "$BUILD"

# The MARKETING version (CFBundleShortVersionString) comes from app.json,
# which is where an Expo project states its version and the only copy anyone
# edits by hand. The native project holds three more — a literal in the app's
# Info.plist and MARKETING_VERSION in four build configurations, which is what
# the widget derives its own from — and because Xcode Cloud never runs
# `expo prebuild`, a bump that only lands in app.json would ship the old
# number. Build 76 was rejected for exactly that: uploaded as 1.0.0 when 1.0.0
# was already live.
VERSION=$(python3 -c "import json,os;print(json.load(open(os.environ['CI_PRIMARY_REPOSITORY_PATH']+'/mobile/app.json'))['expo']['version'])")
agvtool new-marketing-version "$VERSION"
echo "Xcode Cloud: set marketing version to $VERSION"

# Belt-and-suspenders for the app target's literal CFBundleVersion.
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" "TVTime/Info.plist" 2>/dev/null || true

echo "Xcode Cloud: set build number to $BUILD"
