# Ship TV Time to TestFlight with Xcode (no Expo cloud)

This builds and signs the app entirely on your Mac and uploads it straight
to TestFlight. No Expo account, nothing leaves your machine except the final
upload to Apple.

The repo holds source code, not a finished app — so the flow is: generate the
native Xcode project → open it in Xcode → Archive → Upload.

---

## One-time setup

1. **Xcode** — install from the Mac App Store (free, ~7 GB). Launch it once so
   it finishes installing components, then accept the license:
   ```bash
   sudo xcodebuild -license accept
   ```
2. **CocoaPods** (pulls in the native libraries):
   ```bash
   brew install cocoapods
   ```
3. **Add your Apple Developer account to Xcode:** Xcode → Settings → Accounts →
   **+** → Apple ID → sign in.
4. **Create the app record** at
   [appstoreconnect.apple.com](https://appstoreconnect.apple.com) →
   Apps → **+ New App**:
   - Platform **iOS**, Bundle ID **`app.tvtime.personal`**
   - **Name:** must be globally unique — "TV Time" is taken by the original
     app, so use something like **"TV Time Personal"**. (Store-listing name
     only; your home-screen icon still reads "TV Time".)
   - SKU: anything, e.g. `tvtime-personal`
   - Accept any pending agreements (yellow banner) or uploads are rejected.

---

## Build & upload (each release)

From `~/TV-Time/mobile`:

```bash
git checkout -- package-lock.json && git pull && npm ci
npx expo prebuild -p ios --clean     # regenerates ios/ from app.json + installs pods
xed ios                              # opens the project in Xcode
```

In Xcode:

1. Select the **TVTime** project in the left sidebar → **Signing &
   Capabilities** tab → tick **Automatically manage signing** → choose your
   **Team** (your Apple Developer account). Xcode creates the certificate and
   provisioning profile for you.
2. In the top toolbar, set the run destination to **Any iOS Device (arm64)**
   (not a simulator — you can't Archive to a simulator).
3. Menu bar → **Product → Archive**. Wait for the build (a few minutes).
4. The **Organizer** window opens with your archive → **Distribute App** →
   **App Store Connect** → **Upload** → keep the defaults → **Upload**.

The build lands in App Store Connect → **TestFlight** tab as *Processing*
(~10–15 min). Export-compliance is pre-answered in `app.json`, so it won't ask.

---

## Install it, and add friends

App Store Connect → your app → **TestFlight** tab:

- **You (instant):** Internal Testing → New Group → add your Apple ID. Install
  **TestFlight** from the App Store on your iPhone; TV Time appears there.
- **Friends (up to 10,000):** External Testing → New Group → add emails or
  turn on the **Public Link** (a URL anyone taps to join). The first external
  build gets a one-time Apple "Beta App Review," usually cleared within a day;
  updates after that are instant.

Each TestFlight build is installable for 90 days — ship a fresh one before
then to renew.

---

## Shipping updates

Bump the build number so Apple accepts the upload: edit `app.json` →
`ios.buildNumber` (e.g. `"1"` → `"2"`), and for a user-visible version bump
`version` (`"1.0.0"` → `"1.0.1"`). Then repeat the **Build & upload** steps.

> `expo prebuild` regenerates the `ios/` folder from `app.json` every time, so
> treat Xcode-side changes as disposable — set them in `app.json` instead.
> The `ios/` and `android/` folders are gitignored on purpose.
