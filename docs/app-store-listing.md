# App Store listing — TV App

Copy for App Store Connect. Keep this file in step with what actually ships:
the listing is the one piece of the product nobody on the team ever reads back.

Limits are Apple's, and every field below is inside them. Counts in brackets.

---

## App name (30)

```
TV App: TV & Movie Tracking
```
[27] — unchanged, and changing it resets search ranking, so leave it.

## Subtitle (30)

```
Track every show and film
```
[25]

## Keywords (100)

Comma-separated, no spaces — spaces cost characters and buy nothing. Words
already in the name and subtitle are indexed from there, so none are repeated
here.

```
show,tracker,series,episode,watchlist,documentary,binge,calendar,watched,diary,anime,upcoming
```
[93]

## Promotional text (170)

Editable without review, so this is where a release gets announced while the
description stays stable.

```
New: see what everyone is watching this week, get shows sent to you by friends, and find people worth following. Your library still lives on your phone.
```
[152]

## Description (4000)

```
Everything you watch, on your own phone.

TV App tracks the TV shows, movies and documentaries you watch — what to watch
next, what is airing soon, and what you thought of it. Your library lives on
your iPhone. No account needed to use any of it.

WHAT TO WATCH NEXT
Open the app and the next episode of everything you follow is already there,
in the order you are likely to want it. Tick it off in one tap. Shows you have
drifted away from are kept separately, so being forty episodes behind on
something never buries the show you are three behind on.

WHAT IS COMING
Every episode your shows have scheduled, as a list or a calendar. Optional
notifications when something you follow airs, and a home screen widget with
what is up next.

YOUR LIBRARY
Every show and film you have added, with progress on each. Star your
favourites and drag them into the order you would actually defend. Rate
episodes as you go and the show page draws them as a season-by-season grid, so
you can see at a glance where a series found itself and where it lost the plot.

DISCOVER
Search TV and film together. Recommendations built from the people who made
what you already watch — actors, writers, directors — weighted towards what you
have been watching lately rather than what you watched most years ago. Plus
what is airing tonight, what is premiering soon, and what other people here are
watching this week.

FRIENDS, IF YOU WANT THEM
The social half is entirely optional and switched off until you sign in with
Apple. When you do: follow friends, see what they are watching, compare what
you both thought of the same episode, and send a show straight to someone with
a note about why. Every profile shows what that person watches, their ranked
favourites and how deep they are in.

MADE TO SHARE
Finish a series and the app offers a card worth posting. Same for an episode
that aired hours ago, and for your ranked top ten.

BRINGING A HISTORY WITH YOU
Import a CSV export from another tracker and years of watching arrive intact —
watch dates, ratings and all. Export a full backup any time you like, and
restore it on a new phone.

PRIVACY
Your library is stored on your iPhone, not in an account. The social features
mirror only what they need to work, and only once you sign in. You can delete
your account and everything attached to it from inside the app, without
emailing anybody.

Free. No subscription, no adverts, no upsell.
```
[2420]

## What's New — 1.1.0 (4000)

```
TRENDING
Discover now shows what everyone here has been watching over the last seven
days, and the week's biggest episodes.

PEOPLE WORTH FOLLOWING
Suggestions built from your own graph — people your friends follow, and people
whose taste overlaps yours.

SEND A SHOW
Recommend something from your library straight to a friend, with a note. It
arrives as a notification and waits for them on Discover.

NEW FOLLOWERS
A bell on the Friends tab collects everyone who has followed you, so you can
follow back in one tap.

PROFILES
Time spent watching now appears on other people's profiles, not just your own,
and a profile takes its header from whatever its owner put first on their
favourites shelf.

BETTER RECOMMENDATIONS
Half of what feeds them now comes from what you have been watching recently,
rather than all of it coming from what you watched most years ago. Shows you
rated badly no longer count as a vote in favour, and one prolific actor can no
longer fill the whole row.

FIXES
Share links from a profile are now real links that work for anyone, whether or
not they already have the app.
```
[1099]

---

## Before submitting

- **The import line names no competitor.** "A CSV export from another tracker"
  is deliberate: Apple's metadata rules (2.3.7) treat naming another app as a
  reason to reject, and the name would buy nothing a search for "import" does
  not already.
- **Nothing here promises a feature that is not in the build.** Trending,
  suggestions, send-a-show and profile headers all need their SQL applied to
  the live Supabase project first — see supabase/*.sql. Describing them before
  that is describing a screen a reviewer will find empty.
- **No prices, no other platforms, no "beta".** The app is free with nothing to
  buy, so any mention of payment invites a question with no good answer.
