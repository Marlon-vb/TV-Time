"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is best-effort; the app works fine without it.
      });
    }
  }, []);
  return null;
}
