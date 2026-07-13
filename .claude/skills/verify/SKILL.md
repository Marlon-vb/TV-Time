---
name: verify
description: Verify the TV Time iOS app (mobile/) offline — unit tests, typecheck, and a Metro iOS bundle export.
---

# Verifying TV Time (iOS / Expo)

The product is the Expo app in `mobile/`. No iOS simulator exists in this
environment — verify with:

```bash
cd mobile
npx vitest run                                       # pure-logic tests
npx tsc --noEmit                                     # typecheck
EXPO_NO_TELEMETRY=1 npx expo export --platform ios   # Metro bundle must succeed
```

A change is only claimable as verified if all three pass; on-device behavior
must be confirmed by the user via Expo Go (report that honestly).

## Environment gotchas

- `expo install` cannot reach api.expo.dev through the proxy — resolve
  SDK-compatible versions from `node_modules/expo/bundledNativeModules.json`
  (or `npm pack expo@<ver>` and read it) and install with plain npm.
  `mobile/.npmrc` already sets legacy-peer-deps.
- **Expo Go on the user's phone runs SDK 54** (as of 2026-07). The project's
  SDK must match exactly — if the user reports an incompatibility error, ask
  for the SDK number shown in Expo Go and repin using the canonical template:
  `npx create-expo-app tmp --template blank-typescript@sdk-NN --no-install`
  for react/react-native pins + bundledNativeModules.json for expo-* pins.
- SDK API ground truth is the installed `.d.ts` files, not memory — check
  them before using expo-* modules (see mobile/AGENTS.md).
- The user pulls with:
  `git checkout -- package-lock.json && git pull && npm ci` — always commit a
  consistent package-lock.json.
- External APIs (TVmaze/TMDB) are blocked in this sandbox; on-device they
  work. Pure logic (CSV import parsing, category buckets, share messages,
  episode navigation) is unit-tested instead.

## Git history note

The retired web app (Next.js PWA + web-push server) is recoverable at the
local tag `web-app-final` (tag pushes are blocked; the removal commit names
the last web-app commit).
