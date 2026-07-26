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

# Belt-and-suspenders for the app target's literal CFBundleVersion.
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" "TVTime/Info.plist" 2>/dev/null || true

echo "Xcode Cloud: set build number to $BUILD"
