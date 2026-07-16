/** @type {(config: any) => import('@bacons/apple-targets').Config} */
module.exports = (config) => ({
  type: "widget",
  name: "Up Next",
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
