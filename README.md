# TV Time

A personal recreation of the TV Time iOS app: track the shows you watch, see
when new episodes air, and catch up on the ones you've missed. Fully
standalone — your library, watch history, reactions, and notifications all
live on your phone in a local SQLite database. No accounts, no cloud, nothing
to shut down on you.

**The app lives in [`mobile/`](mobile/)** — see
[mobile/README.md](mobile/README.md) for full docs.

## Quick start

1. Install **Expo Go** from the App Store on your iPhone.
2. On your computer:
   ```bash
   cd mobile
   npm ci
   npx expo start
   ```
3. Scan the QR code with the iPhone camera (same Wi-Fi).

## Features

- **Watch Next** — the next unwatched episode of every show, with
  behind-by-N badges
- **Upcoming** — day-by-day agenda of announced episodes
- **Episode pages** — stills, spoiler-guarded synopses, emoji reactions,
  prev/next navigation
- **My Shows** — TV Time's categories (Watching / Up to date / Not started /
  Finished / Archived) with progress bars
- **Discover** — search TVmaze's catalog of 80,000+ shows (no API key needed)
- **Episode notifications** — locally scheduled at each episode's exact air
  time; no push server
- **Share cards** — "Just watched…" posts to iMessage/WhatsApp via the native
  share sheet
- **Profile stats** — time watched, episodes per month, top shows and genres
- **TV Time import** — bring your export zip in via the Files app
- Optional TMDB key for richer artwork and exact import matching

## History

This repo previously contained a self-hosted web (PWA) version of the app.
It was retired when development moved fully to iOS — recover it from git
history at the `web-app-final` tag / the commit noted in the removal commit.
