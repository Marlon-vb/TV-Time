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

## Push notifications

In mock mode deliveries are written to the `push_outbox` table instead of the
network. Verify the whole loop over HTTP:

```bash
curl -s -X POST $B/api/push/subscribe -H 'Content-Type: application/json' \
  -d '{"subscription":{"endpoint":"https://push.example/dev1","keys":{"p256dh":"k","auth":"a"}},"label":"Test"}'
curl -s -X POST $B/api/push/check     # -> {episodes, sent}
curl -s -X POST $B/api/push/test      # test notification
node -e "const db=require('better-sqlite3')('/tmp/verify-data/tvtime.db');console.log(db.prepare('SELECT payload FROM push_outbox').all())"
```

Episodes qualify when they aired within PUSH_LOOKBACK_HOURS (default 12) and
are unwatched/unnotified — start the server with e.g. PUSH_LOOKBACK_HOURS=96
so recent mock episodes qualify. The scheduler (instrumentation.ts) logs
"[tvtime] episode notification scheduler running" on boot and ticks every
PUSH_CHECK_MINUTES (default 5).

## Mobile app (mobile/)

No iOS simulator here — verify with:

```bash
cd mobile
npx vitest run                                  # pure-logic tests
npx tsc --noEmit                                # typecheck
EXPO_NO_TELEMETRY=1 npx expo export --platform ios   # Metro bundle must succeed
```

`expo install` cannot reach api.expo.dev through the proxy — resolve
SDK-compatible versions from `node_modules/expo/bundledNativeModules.json`
and install with plain npm (use --legacy-peer-deps for react-dom peer
conflicts). SDK 57 API ground truth is the installed `.d.ts` files, not
memory — check them before using expo-* modules.

## Gotchas

- Mock air dates move with the clock; assert on relative facts (counts,
  ordering, categories), not absolute dates.
- The SQLite handle is cached on `globalThis` — restart the server after
  changing `TVTIME_DATA_DIR`.
- Unit tests: `npx vitest run` (importer parsing + category buckets only).
