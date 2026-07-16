# iOS home-screen widget — "Up Next"

A WidgetKit extension (small + medium) that shows the next episodes waiting in
your TV Time backlog, right on the home screen. Built with
[`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets).

## How it works

- The app writes a tiny JSON snapshot of your Up Next list to a shared **App
  Group** (`group.app.tvtime.personal`) via `ExtensionStorage`
  (`mobile/lib/widget.ts`), and reloads the widget timeline.
- The widget (`targets/upnext/widgets.swift`) reads that snapshot from the
  App Group's `UserDefaults` and renders it — no network, instant paint.
- The snapshot refreshes whenever the Watch Next tab loads and on every
  background sync (`lib/sync.ts`), so the widget tracks what you've watched.

## Important: it only appears in an EAS build

The widget is native code. It does **not** run in Expo Go — the `ExtensionStorage`
calls simply no-op there, and the app behaves exactly as before. To see the
widget you need a development or production build:

```bash
cd mobile
eas build --profile production --platform ios   # or: --profile development
```

## One-time Apple setup (handled by EAS)

On the first build after adding the widget, EAS Build (with managed
credentials) will detect the new extension target and the App Group
entitlement and offer to register them on the Apple Developer portal:

1. the widget extension's bundle ID (`app.tvtime.personal.Up-Next`), and
2. the App Group `group.app.tvtime.personal` on both the app and the extension.

Say yes to the prompts. No manual portal work is normally needed.

- **Team ID:** the target inherits the app's signing team from EAS credentials,
  so no `appleTeamId` is required. To silence the plugin's warning you can add
  `"appleTeamId": "XXXXXXXXXX"` under `ios` in `app.json` (find it in Xcode →
  your team, or on developer.apple.com → Membership).

## Editing the widget UI

`targets/upnext/widgets.swift` is plain SwiftUI. After `npx expo prebuild -p ios`
you can open `ios/` in Xcode (`xed ios`) and edit it live; changes persist back
to this folder. Colors come from `expo-target.config.js` (`$accent`,
`$widgetBackground`).
