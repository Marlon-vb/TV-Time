# TV Time — building via Xcode Cloud (no EAS)

Goal: build and ship to TestFlight using **Apple's own Xcode Cloud** instead of
EAS. After a one-time setup, a build is triggered by a git push — so once it's
wired up, Claude can kick off builds for you from anywhere, no laptop needed.

The **initial setup needs your Mac once** (Xcode Cloud is connected through
Xcode). Budget ~30–45 minutes. After that it's hands-off.

---

## What you need first

- A Mac with the latest **Xcode** installed, signed into your Apple ID.
- The app already exists in App Store Connect (it does — App ID `6791087580`).
- Membership in the Apple Developer Program (you have this — you've shipped
  TestFlight builds already).

---

## Step 1 — Generate the native iOS project (Mac)

This app is managed by Expo, which normally generates the native project on the
fly. Xcode Cloud needs it committed to the repo.

```bash
cd ~/TV-Time
git pull
cd mobile
npm ci
npx expo prebuild --platform ios        # creates mobile/ios/
```

Then un-ignore and commit it. The repo currently ignores `/ios`:

```bash
# from repo root
cd ~/TV-Time
# remove the "/ios" line from mobile/.gitignore, then:
git add -f mobile/ios
git add mobile/.gitignore
git commit -m "Add native iOS project for Xcode Cloud"
git push
```

> Note: once `mobile/ios` is committed, changes to `app.json`/config plugins no
> longer apply automatically — re-run `npx expo prebuild -p ios --clean` and
> commit when you change native config. Day-to-day JS/TS changes need no
> prebuild.

## Step 2 — Add the Xcode Cloud CI script (Mac)

Xcode Cloud runs on a clean Mac that has no node/JS deps or CocoaPods yet. This
script installs them right after it clones the repo. Create it **exactly** at
this path (next to the Xcode project):

`mobile/ios/ci_scripts/ci_post_clone.sh`

```bash
#!/bin/sh
set -e

# Xcode Cloud clones to $CI_PRIMARY_REPOSITORY_PATH; the Expo app is in mobile/.
cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

# Node (via the Xcode Cloud Homebrew) + JS dependencies.
brew install node@20
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm ci

# CocoaPods for the native project.
export LANG=en_US.UTF-8
HOMEBREW_NO_AUTO_UPDATE=1 brew install cocoapods
cd ios
pod install
```

Make it executable and commit:

```bash
chmod +x mobile/ios/ci_scripts/ci_post_clone.sh
git add mobile/ios/ci_scripts/ci_post_clone.sh
git commit -m "Add Xcode Cloud post-clone script"
git push
```

## Step 3 — Connect Xcode Cloud (Mac, in Xcode)

1. Open the workspace: `open mobile/ios/TVTime.xcworkspace` (name may differ —
   open the `.xcworkspace`, not the `.xcodeproj`).
2. In Xcode: **Product → Xcode Cloud → Create Workflow…**
3. Pick the app's scheme (the main app target, e.g. `TVTime`).
4. When prompted, **grant access to the GitHub repo** `Marlon-vb/TV-Time`
   (installs the Xcode Cloud GitHub app).
5. Configure the workflow:
   - **Branch**: `claude/tv-tracking-app-n3wkwg` (or `main` once merged).
   - **Start Condition**: *Manual* to begin with (you can add "on push" later —
     see Step 5). Manual keeps you off the build-minute treadmill while testing.
   - **Action**: **Archive** → set the archive to build for **iOS** and prepare
     for **TestFlight (Internal Testing)**.
6. **Signing**: let Xcode Cloud manage signing automatically (it creates the
   distribution cert + provisioning profiles for the app **and** the widget
   extension). Just confirm the team when asked.
7. Save and run the first build.

## Step 4 — First build & fixes

The first run usually needs one or two tweaks — that's normal for Expo +
Xcode Cloud:
- If it can't find `node`/`pod`, adjust the `brew` paths in the CI script.
- If signing fails on the widget, make sure the widget target's bundle id is
  `app.tvtime.personal.widget` and it's in the App Group
  `group.app.tvtime.personal` (it is, in config) and let Xcode Cloud manage it.

Once green, the build lands in **TestFlight** automatically.

## Step 5 — Make it push-to-build (so Claude can trigger it)

Once the manual build is green, edit the workflow's **Start Condition** to
**Branch Changes** on your build branch. From then on:

- **You (or Claude) push a commit → Xcode Cloud builds → TestFlight.**
- To avoid a build on every tiny commit, point the trigger at a dedicated
  branch (e.g. `release`) and only build when that branch moves. Claude can
  fast-forward `release` to the latest whenever you say "ship it."

That's the finish line: from then on, "build it" just means a push, which
Claude can do from here — no laptop required.

---

## Free tier

Xcode Cloud includes **25 compute hours/month** free. A TV Time build is small,
so that's plenty for regular TestFlight builds. Manual start (Step 3) while you
dial it in avoids burning hours on every commit.
