#!/bin/sh
set -e

# Xcode Cloud clones to $CI_PRIMARY_REPOSITORY_PATH; the Expo app lives in mobile/.
cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

# Skip Homebrew's self-update and post-install cleanup. Both are slow on a
# fresh Xcode Cloud Mac and aren't needed for a one-shot CI install.
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

# Node + JS dependencies.
# node@20 was disabled in Homebrew on 2026-10-28. node@24 is the supported
# LTS: node@22 is already deprecated, and unversioned `node` tracks Current
# (26.x). Expo SDK 54 / React Native 0.81 require Node >= 20.19.4.
# node@24 is keg-only, so its opt path has to be on PATH explicitly.
brew install node@24
export PATH="$(brew --prefix node@24)/bin:$PATH"
npm ci

# Pin node for Xcode's "Bundle React Native code and images" build phase
echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local

# CocoaPods
export LANG=en_US.UTF-8
brew install cocoapods
cd ios
pod install
