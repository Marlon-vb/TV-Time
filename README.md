# TV App

Track the TV shows, movies and documentaries you watch, see what airs tonight,
and catch up on what you've missed. Your library, watch history, ratings and
notifications live on your phone in a local SQLite database, and the whole app
works signed out. Signing in with Apple adds an optional social layer: follow
friends, see what they're watching, and talk about episodes.

**The app lives in [`mobile/`](mobile/)** — see
[mobile/README.md](mobile/README.md) for full docs.
**The website lives in [`site/`](site/)** — plain static HTML, published on
GitHub Pages, serving the privacy policy, terms and support pages that App
Store Connect points at.

App Store listing: name `TV App`, subtitle `Social Show & Movie Tracker`.

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

- **Watch Next** — the next unwatched episode of every show, grouped into up
  next / haven't watched in a while / haven't started, with behind-by-N badges
- **Library** — shows and a separate movies-and-documentaries watchlist, with
  progress bars, four sort orders and the Watching / Up to date / Not started /
  Finished / Archived filters
- **Upcoming** — day-by-day agenda of announced episodes, or a month calendar
- **Episode pages** — stills, spoiler-guarded synopses, per-episode star
  ratings, rewatch tracking, and swipe navigation through the season
- **Discover** — one search box across TV, movies and documentaries, plus
  rails for recommendations, premiering soon, all-time greats and airing
  tonight
- **Friends** (optional) — follow people, an activity feed, episode comments
  with GIFs, community ratings and best-character votes
- **Home-screen widget** — what's up next, without opening the app
- **Episode notifications** — scheduled locally at each episode's exact air
  time; no push server involved
- **Profile stats and diary** — time watched, top shows and genres, and every
  episode day by day
- **Import** — bring in an export from the original TV Time app via the Files
  app; optional TMDB key for richer artwork and exact episode matching
- **Backup** — export and restore your whole library as a JSON file

## Data sources

TV data from [TVmaze](https://www.tvmaze.com) (CC BY-SA). Movies and
documentaries from the Apple iTunes Search API. GIF search powered by Tenor.
Optional artwork enrichment uses the TMDB API but is not endorsed or certified
by TMDB. Not affiliated with any network or streaming service.

## History

This repo previously contained a self-hosted web (PWA) version of the app.
It was retired when development moved fully to iOS — recover it from git
history at the `web-app-final` tag / the commit noted in the removal commit.

The app shipped under the name "TV Time" during private beta. It was renamed
to avoid Whip Media's trademark before public submission; the import feature
still reads that app's exports, which is why the name still appears in the
importer and in copy describing it.
