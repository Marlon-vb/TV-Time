#!/bin/sh
set -e

# Xcode Cloud clones to $CI_PRIMARY_REPOSITORY_PATH; the Expo app lives in mobile/.
cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

# Node + JS dependencies
brew install node@20
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm ci

# Pin node for Xcode's "Bundle React Native code and images" build phase
echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local

# CocoaPods
export LANG=en_US.UTF-8
HOMEBREW_NO_AUTO_UPDATE=1 brew install cocoapods
cd ios
pod install
