"use client";

import { useEffect, useRef, useState } from "react";
import { postJson, useApi } from "@/lib/useApi";
import type { ImportReport } from "@/lib/types";

interface Settings {
  tmdbConfigured: boolean;
  tmdbKeyPreview: string | null;
  spoilerProtection: boolean;
}

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">Settings</h1>
      <div className="space-y-4">
        <NotificationsSection />
        <ImportSection />
        <TmdbSection />
        <PreferencesSection />
        <SyncSection />
        <CalendarSection />
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-base font-extrabold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------ notifications */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : "Linux";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${os} · ${browser}`;
}

type PushState =
  | "loading"
  | "unsupported"
  | "no-sw"
  | "denied"
  | "off"
  | "on";

function NotificationsSection() {
  const [state, setState] = useState<PushState>("loading");
  const [devices, setDevices] = useState<
    { endpoint: string; label: string | null; created_at: string }[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadDevices = async () => {
    const res = await fetch("/api/push");
    if (res.ok) setDevices((await res.json()).devices);
  };

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      await loadDevices();
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setState("no-sw");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push")).json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await postJson("/api/push/subscribe", {
        subscription: sub.toJSON(),
        label: deviceLabel(),
      });
      if (!res.ok) throw new Error(res.error ?? "Subscribe failed");
      setState("on");
      setMessage("Notifications enabled on this device.");
      await loadDevices();
    } catch (err) {
      setMessage(`Could not enable notifications: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await postJson("/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
      await loadDevices();
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    const res = await postJson<{ sent: number }>("/api/push/test");
    setMessage(
      res.ok
        ? `Test sent to ${res.data?.sent} device(s) — it should pop up in a moment.`
        : res.error
    );
    setBusy(false);
  };

  const removeDevice = async (endpoint: string) => {
    await postJson("/api/push/unsubscribe", { endpoint });
    await loadDevices();
  };

  return (
    <Section title="Episode notifications">
      <p className="text-sm text-muted">
        Get a push notification when a new episode of a show you follow airs
        — checked every few minutes, even while the app is closed. Archived
        shows stay quiet.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === "loading" && (
          <span className="text-sm text-faint">Checking this device…</span>
        )}
        {state === "unsupported" && (
          <span className="text-sm text-faint">
            This browser doesn&apos;t support Web Push.
          </span>
        )}
        {state === "no-sw" && (
          <span className="text-sm text-faint">
            Notifications need the production app (run{" "}
            <code className="rounded bg-raised px-1">npm start</code>) — the
            service worker isn&apos;t active in dev mode.
          </span>
        )}
        {state === "denied" && (
          <span className="text-sm text-danger">
            Notifications are blocked for this site — allow them in your
            browser&apos;s site settings, then reload.
          </span>
        )}
        {state === "off" && (
          <button
            onClick={enable}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink hover:bg-accent-dim disabled:opacity-50"
          >
            Enable on this device
          </button>
        )}
        {state === "on" && (
          <>
            <button
              onClick={sendTest}
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink hover:bg-accent-dim disabled:opacity-50"
            >
              Send test notification
            </button>
            <button
              onClick={disable}
              disabled={busy}
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted hover:bg-raised hover:text-fg disabled:opacity-50"
            >
              Disable on this device
            </button>
          </>
        )}
      </div>

      {message && <p className="mt-2 text-sm text-muted">{message}</p>}

      {devices.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {devices.map((d) => (
            <li
              key={d.endpoint}
              className="flex items-center justify-between rounded-lg border border-line bg-raised px-3 py-2 text-sm"
            >
              <span className="font-semibold">{d.label ?? "Device"}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-faint">
                  since {d.created_at.slice(0, 10)}
                </span>
                <button
                  onClick={() => removeDevice(d.endpoint)}
                  className="text-xs font-semibold text-danger/80 hover:text-danger"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-faint">
        On iPhone/iPad: add the app to your Home Screen first (Share → Add to
        Home Screen), then enable notifications from inside it. Push requires
        HTTPS (or localhost).
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------- TV Time import */

function ImportSection() {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = () => {
    if (polling.current) return;
    polling.current = setInterval(async () => {
      const res = await fetch("/api/import");
      const json = (await res.json()) as ImportReport;
      setReport(json);
      if (json.status !== "running" && polling.current) {
        clearInterval(polling.current);
        polling.current = null;
      }
    }, 1000);
  };

  useEffect(() => {
    // Resume progress display if an import is already running.
    void fetch("/api/import")
      .then((r) => r.json())
      .then((json: ImportReport) => {
        if (json.status !== "idle") setReport(json);
        if (json.status === "running") poll();
      });
    return () => {
      if (polling.current) clearInterval(polling.current);
    };
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
      } else {
        setReport(json);
        poll();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <Section title="Import from TV Time">
      <p className="text-sm text-muted">
        Upload the data export from the original TV Time app (Settings →
        “Export your data”, or the GDPR export zip). Followed shows and watched
        episodes are matched and carried over.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept=".zip,.csv"
          multiple
          onChange={(e) => upload(e.target.files)}
          disabled={uploading || report?.status === "running"}
          className="block text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-bold file:text-ink hover:file:bg-accent-dim disabled:opacity-50"
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {report && report.status !== "idle" && (
        <div className="mt-4 rounded-lg border border-line bg-raised p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              {report.status === "running"
                ? "Importing…"
                : report.status === "done"
                  ? "Import complete"
                  : "Import failed"}
            </span>
            <span className="tabular-nums text-muted">
              {Math.round(report.progress * 100)}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-overlay">
            <div
              className={`h-full rounded-full transition-[width] ${
                report.status === "error" ? "bg-danger" : "bg-accent"
              }`}
              style={{ width: `${Math.round(report.progress * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">{report.message}</p>
          {report.showsFailed.length > 0 && (
            <p className="mt-1 text-xs text-faint">
              Not matched: {report.showsFailed.join(", ")}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

/* --------------------------------------------------------------------- TMDB */

function TmdbSection() {
  const { data, refresh } = useApi<Settings>("/api/settings");
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await postJson("/api/settings", { tmdbApiKey: key });
    setMessage(res.ok ? "Saved — key verified with TMDB." : res.error);
    if (res.ok) {
      setKey("");
      await refresh();
    }
    setSaving(false);
  };

  return (
    <Section title="TMDB artwork & episode matching (optional)">
      <p className="text-sm text-muted">
        Add a free API key from{" "}
        <a
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          themoviedb.org
        </a>{" "}
        to get higher-quality posters and backdrops, and exact episode matching
        for classic TV Time exports.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={
            data?.tmdbConfigured
              ? `Configured (${data.tmdbKeyPreview}) — paste to replace`
              : "Paste your TMDB API key…"
          }
          className="w-full max-w-md rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-accent"
        />
        <button
          onClick={save}
          disabled={saving || key.trim() === ""}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink hover:bg-accent-dim disabled:opacity-50"
        >
          {saving ? "Verifying…" : "Save key"}
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-muted">{message}</p>}
    </Section>
  );
}

/* -------------------------------------------------------------- preferences */

function PreferencesSection() {
  const { data, refresh } = useApi<Settings>("/api/settings");

  const toggle = async () => {
    await postJson("/api/settings", {
      spoilerProtection: !(data?.spoilerProtection ?? true),
    });
    await refresh();
  };

  const on = data?.spoilerProtection ?? true;
  return (
    <Section title="Preferences">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span>
          <span className="block text-sm font-semibold">Spoiler protection</span>
          <span className="block text-xs text-muted">
            Blur episode descriptions until you&apos;ve watched them.
          </span>
        </span>
        <span
          role="switch"
          aria-checked={on}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            on ? "bg-accent" : "bg-overlay"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-[left] ${
              on ? "left-[22px]" : "left-0.5"
            }`}
          />
        </span>
      </button>
    </Section>
  );
}

/* --------------------------------------------------------------------- sync */

function SyncSection() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sync = async () => {
    setBusy(true);
    setMessage("Refreshing all shows from TVmaze…");
    const res = await postJson<{ synced: number; failed: number }>("/api/sync");
    setMessage(
      res.ok
        ? `Done — ${res.data?.synced ?? 0} shows refreshed${
            res.data?.failed ? `, ${res.data.failed} failed` : ""
          }.`
        : res.error
    );
    setBusy(false);
  };

  return (
    <Section title="Data sync">
      <p className="text-sm text-muted">
        Episode lists and air dates refresh automatically in the background.
        Running shows also refresh when you open them. Force a full refresh
        here.
      </p>
      <button
        onClick={sync}
        disabled={busy}
        className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted hover:bg-raised hover:text-fg disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync all shows now"}
      </button>
      {message && <p className="mt-2 text-sm text-muted">{message}</p>}
    </Section>
  );
}

/* ----------------------------------------------------------------- calendar */

function CalendarSection() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/api/calendar.ics`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Section title="Calendar feed">
      <p className="text-sm text-muted">
        Subscribe to your upcoming episodes from Google Calendar or Apple
        Calendar — new episodes of shows you follow appear as events.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-muted">
          /api/calendar.ics
        </code>
        <button
          onClick={copy}
          className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:bg-raised hover:text-fg"
        >
          {copied ? "Copied ✓" : "Copy full URL"}
        </button>
      </div>
    </Section>
  );
}
