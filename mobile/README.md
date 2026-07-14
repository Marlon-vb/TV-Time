# TV Time — iOS app

The native mobile version of TV Time, built with Expo / React Native. Fully
standalone: your library, watch history, and notifications all live on the
phone in a local SQLite database — no server required.

## Features

Everything the web app does, natively:

- **Watch Next** in TV Time's sections — Up next, Haven't watched in a
  while (idle 30+ days), Haven't started — with behind-by-N badges and
  one-tap mark-watched
- **"What should I watch tonight?"** — one tap suggests an episode from your
  backlog with a reason (nearly caught up, neglected show, quick episode)
- **Upcoming** agenda grouped by day
- **Episode pages** — tap any episode for its still, synopsis
  (spoiler-guarded), watched toggle, emoji reaction, and prev/next
  navigation
- **Share cards** — send "Just watched…" posts to iMessage/WhatsApp via the
  native share sheet, from any episode or show
- **My Shows** grid with TV Time's category chips and progress bars
- **Show pages** with season accordions, spoiler-hidden episode summaries,
  mark season / mark all, and long-press an episode to mark
  "watched up to here"
- **Discover** search over TVmaze's catalog
- **Profile** stats: time watched, episodes per month, top shows and genres,
  plus 12 achievements to unlock (Century Club, Binge Lord, Zero Inbox…)
- **TV Time import**: pick your export zip straight from the Files app
- **Episode notifications**: locally scheduled at each episode's exact air
  time — delivered by iOS even with the app closed, no push server involved.
  Air dates refresh on launch and via background sync.

## Run it on your iPhone (no Mac needed)

1. Install **Expo Go** from the App Store on your iPhone.
2. On your computer:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
3. Scan the QR code with the iPhone camera (phone and computer on the same
   Wi-Fi). The app opens in Expo Go.

Note: in Expo Go, background sync doesn't run (Apple restriction on the Go
sandbox) — air dates still refresh every time you open the app, and scheduled
episode notifications work.

## Build a real standalone app

With a free [Expo account](https://expo.dev) and Apple credentials:

```bash
npm install -g eas-cli
eas build --platform ios
```

- Installing on your own device via TestFlight/App Store requires an Apple
  Developer membership ($99/year).
- `eas build --platform android` produces an installable APK with no fee.

## Development

```bash
npm test          # unit tests (CSV/import parsing, notification selection)
npm run typecheck
npx expo export --platform ios   # verify the bundle compiles
```
