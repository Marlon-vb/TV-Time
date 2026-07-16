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
3. It should say success.

> Upgrading from an earlier version of the schema? `CREATE TABLE IF NOT
> EXISTS` won't add new columns to tables that already exist, so run
> [`reset.sql`](./reset.sql) first (it drops the social tables — safe on a
> project with no real users yet), then run `schema.sql`.

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

## Push notifications (optional, ~5 minutes)

Sends a real iPhone push when someone follows you, likes your comment, or
comments on an episode you commented on. Three pieces: an Edge Function that
talks to Expo's push API, database triggers that call it, and a shared
secret between the two.

You'll need the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
(`brew install supabase/tap/supabase`), logged in with `supabase login`.

```bash
# from the repo root — <project-ref> is the id in your project's URL
supabase link --project-ref <project-ref>

# 1. Make up a long random secret and store it for the function
supabase secrets set NOTIFY_SECRET=<paste a long random string>

# 2. Deploy the function (no JWT check — the secret gates it instead)
supabase functions deploy notify --no-verify-jwt
```

Then in the **SQL Editor**:

1. Run [`notifications.sql`](./notifications.sql) (safe to re-run any time).
2. Point it at your function with the SAME secret from step 1:

```sql
insert into public.notify_config (function_url, secret)
values (
  'https://<project-ref>.supabase.co/functions/v1/notify',
  '<the same random string>'
)
on conflict (single) do update
  set function_url = excluded.function_url, secret = excluded.secret;
```

That's it — pushes go out to any device that has signed in and allowed
notifications. Until `notify_config` has a row, the triggers silently do
nothing, so you can run `notifications.sql` early without breaking anything.

> The Edge Function uses the service-role key **inside Supabase's own
> servers** (they inject it into the function's environment). You never
> copy or paste it anywhere, and it's never in the app.

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
