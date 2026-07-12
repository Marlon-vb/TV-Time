# TV Time — iOS app

The native mobile version of TV Time, built with Expo / React Native. Fully
standalone: your library, watch history, and notifications all live on the
phone in a local SQLite database — no server required.

## Features

Everything the web app does, natively:

- **Watch Next** with behind-by-N badges and one-tap mark-watched
- **Upcoming** agenda grouped by day
- **My Shows** grid with TV Time's category chips and progress bars
- **Show pages** with season accordions, spoiler-hidden episode summaries,
  mark season / mark all, and long-press an episode to mark
  "watched up to here"
- **Discover** search over TVmaze's catalog
- **Profile** stats: time watched, episodes per month, top shows and genres
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
