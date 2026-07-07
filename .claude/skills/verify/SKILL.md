---
name: verify
description: Build, launch, and drive the TV Time app end-to-end in offline mock mode; capture API evidence and page screenshots.
---

# Verifying TV Time

External APIs (TVmaze/TMDB) are usually unreachable in sandboxes — always
verify in mock mode (`TV_API_MOCK=1`), which serves a deterministic fixture
universe of 8 shows (ids 101–108, see `lib/mock.ts`) with air dates generated
relative to "today".

## Build & launch

```bash
npm run build
rm -rf /tmp/verify-data   # fresh library
TV_API_MOCK=1 TVTIME_DATA_DIR=/tmp/verify-data npx next start -p 3789 &
```

Note: `pkill -f 'next start'` can match your own shell — kill by pid
(`pgrep -f next-server`).

## Drive the flows (HTTP surface)

```bash
B=http://localhost:3789
curl -s "$B/api/search?q=signal"                                  # search
curl -s -X POST $B/api/shows -H 'Content-Type: application/json' \
  -d '{"tvmazeId":101}'                                           # follow
curl -s -X POST $B/api/shows/101/watch -H 'Content-Type: application/json' \
  -d '{"action":"season","season":1,"watched":true}'              # mark
curl -s $B/api/watch-next                                         # behind counts
curl -s $B/api/upcoming?days=90                                   # schedule
curl -s $B/api/stats
curl -s $B/api/calendar.ics | head
```

Import: mock TVDB show ids are 501101–501108; mock TVDB *episode* ids are
`900000 + <tvmaze episode id>` (episode id = `showId*1000 + season*100 + num`,
e.g. S1E3 of show 105 → episode 105103 → TVDB id 1005103 — NOT string
concatenation). Build a CSV/zip with those and POST it:

```bash
curl -s -X POST $B/api/import -F "files=@export.zip"   # then poll GET /api/import
```

## Screenshot the UI

Headless Chromium renders the client pages fine:

```bash
/opt/pw-browsers/chromium --headless --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=1280,1400 --virtual-time-budget=8000 \
  --screenshot=home.png http://localhost:3789/
```

Pages worth checking: `/` (watch next), `/upcoming`, `/shows`, `/show/101`
(seasons, spoiler blur), `/stats`, `/settings`.

## Gotchas

- Mock air dates move with the clock; assert on relative facts (counts,
  ordering, categories), not absolute dates.
- The SQLite handle is cached on `globalThis` — restart the server after
  changing `TVTIME_DATA_DIR`.
- Unit tests: `npx vitest run` (importer parsing + category buckets only).
