/** @type {(config: any) => import('@bacons/apple-targets').Config} */
module.exports = (config) => ({
  type: "widget",
  // No space: EAS's credential/configure step looks up the target by its
  // space-stripped name ("UpNext"), so the Xcode target name must match it
  // exactly or the profile-assignment step fails with "Could not find target".
  // The user-facing widget title is set separately in widgets.swift.
  name: "UpNext",
  // Pin the bundle id to the one already registered (…/.widget) so the fix
  // doesn't mint a new identifier that would need re-provisioning.
  bundleIdentifier: ".widget",
  icon: "../../assets/icon.png",
  // On-brand color sets. The plugin writes each as `<name>.colorset`, and the
  // special `$accent` / `$widgetBackground` keys also set the target's global
  // accent + widget-background build settings. Referenced from widgets.swift.
  colors: {
    $accent: "#fbd737",
    $widgetBackground: "#0b0c14",
  },
  // Share the same App Group the app writes to, from app.json (single source).
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
