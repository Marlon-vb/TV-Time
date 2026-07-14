# Shipping TV Time to TestFlight

This makes the app fully standalone — it installs on your iPhone like any
App Store app, works anywhere (no Mac mini needed), and can be shared with
friends. The build runs in Expo's cloud, so no Xcode required.

**You need:** a free [Expo account](https://expo.dev/signup) and your paid
Apple Developer account (you have this).

Run everything from `~/TV-Time/mobile`.

---

## 1. Install the EAS command-line tool

```bash
cd ~/TV-Time/mobile
npx eas-cli@latest --version   # downloads it on first use; prints a version
```

## 2. Log in to Expo and link the project

```bash
npx eas-cli@latest login       # your Expo account (create one if needed)
npx eas-cli@latest init        # press Y to create the project "tv-time"
```

`init` writes an `extra.eas.projectId` into `app.json` — commit that change
(or I can, if you paste it back).

## 3. Create the app record in App Store Connect (do this once, in a browser)

Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) →
**Apps → +  → New App**:

- **Platform:** iOS
- **Name:** must be **globally unique**, and "TV Time" is taken by the
  original app — so name the *record* something like **"TV Time Personal"**
  or **"Bingelog"**. (This is only the store-listing name; the icon label on
  your home screen stays "TV Time".)
- **Bundle ID:** select `app.tvtime.personal` (EAS registers it for you
  during the first build — if it's not in the list yet, do step 4 first,
  then come back)
- **SKU:** anything, e.g. `tvtime-personal`
- **User Access:** Full Access

Also accept any pending agreements at App Store Connect → **Business** /
the yellow banner, or builds can't be submitted.

## 4. Build the app in the cloud

```bash
npx eas-cli@latest build --platform ios --profile production
```

What to expect at the prompts:

- **"Log in to your Apple account?"** → **Yes**. Enter your Apple ID and
  password (and the 6-digit code Apple texts you). EAS then automatically
  creates the signing certificate and provisioning profile — you don't touch
  any of that by hand.
- The build runs on Expo's servers (~10–20 min). You'll get a link to watch
  it; it ends with a downloadable `.ipa`.

## 5. Upload the build to TestFlight

```bash
npx eas-cli@latest submit --platform ios --profile production --latest
```

Log in to Apple again when asked. This uploads the build to App Store
Connect. It then shows as **Processing** in the **TestFlight** tab for
~10–15 minutes. (Export-compliance is already answered in `app.json`, so
it won't nag you.)

## 6. Install it on your phone, and add friends

In App Store Connect → your app → **TestFlight** tab:

- **Yourself (instant):** under **Internal Testing**, create a group, add
  your Apple ID. Install **TestFlight** from the App Store on your iPhone,
  open it, and TV Time is there. Internal builds appear with no review.
- **Friends (up to 10,000):** under **External Testing**, create a group and
  either add their emails or enable the **Public Link** — a URL anyone can
  tap to join via TestFlight. The *first* external build goes through a quick
  Apple "Beta App Review" (usually ~1 day); after that, updates are instant.

Builds stay installable for 90 days; ship a fresh build before then to renew.

---

## Shipping updates later

```bash
cd ~/TV-Time/mobile
git checkout -- package-lock.json && git pull && npm ci
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

The build number auto-increments (`autoIncrement` in `eas.json`). Bump
`version` in `app.json` (e.g. `1.0.1`) for user-visible releases.

> Tip: once you're comfortable, `eas build ... --auto-submit` does steps
> 4 and 5 in one command.
