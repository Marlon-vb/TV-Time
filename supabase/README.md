# TV Time — social backend (Supabase)

The friends/activity-feed layer runs on [Supabase](https://supabase.com)
(a hosted Postgres database with built-in auth). This is the one piece you
need to set up; it's free to start and stays free until you have real scale.

## One-time setup (~10 minutes)

### 1. Create the project
1. Sign up at [supabase.com](https://supabase.com) (free).
2. **New Project** → name it `tv-time`, pick a region near you, set a database
   password (save it somewhere, though the app won't need it).
3. Wait ~2 minutes for it to provision.

### 2. Create the database tables
1. In the project → **SQL Editor** → **New query**.
2. Open [`schema.sql`](./schema.sql), copy the whole file, paste it in, **Run**.
3. It should say success. (Re-running it later is safe.)

### 3. Turn on Sign in with Apple
1. In the project → **Authentication** → **Providers** → **Apple** → enable it.
2. In the **Client IDs** field, add the app's bundle ID: `app.tvtime.personal`
   (native Sign in with Apple needs only this — no secret required).
3. Save.

### 4. Get the two values the app needs
1. Project → **Project Settings** → **API**.
2. Copy the **Project URL** (looks like `https://abcd1234.supabase.co`).
3. Copy the **anon / public** API key (a long token labeled `anon` `public`).
4. Send me both — I'll wire them into the app.

## Security notes (important)

- The **anon / public key is meant to be embedded in the app.** It's safe to
  ship; every table is locked down by Row Level Security so users can only
  touch their own data (and their friends' activity). Sharing it with me is
  fine.
- The **`service_role` key is the opposite** — it bypasses all security. Never
  put it in the app, never paste it anywhere, never share it. We don't use it.
- Contact matching only ever stores **one-way SHA-256 hashes** of phone
  numbers/emails, never the raw values, and they're readable only through the
  `find_friends` function — not directly queryable.

## What the schema gives us

- `profiles` — one per user (username, display name, avatar)
- `follows` — the follow graph
- `activities` — the feed (watched / reacted / finished / started events)
- `comments` — per-episode discussion threads
- `find_friends(phone_hashes, email_hashes)` — privacy-preserving friend
  discovery from your contacts
- `feed(limit, before)` — your activity feed, paginated
- a trigger that auto-creates a profile the first time someone signs in
