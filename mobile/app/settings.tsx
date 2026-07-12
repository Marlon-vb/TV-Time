import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { colors, fonts } from "@/lib/theme";
import { getSetting, setSetting } from "@/lib/db";
import * as repo from "@/lib/repo";
import * as tmdb from "@/lib/tmdb";
import { parseImportFiles, type ImportFile } from "@/lib/importer";
import { runImport, type ImportProgress } from "@/lib/importRunner";
import {
  notificationsEnabled,
  rescheduleAll,
  sendTestNotification,
  setNotificationsEnabled,
} from "@/lib/notifications";

export default function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
      <NotificationsSection />
      <ImportSection />
      <TmdbSection />
      <PreferencesSection />
      <SyncSection />
    </ScrollView>
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
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 16,
        gap: 10,
      }}
    >
      <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 15 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Button({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: primary ? colors.accent : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: colors.line,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: primary ? colors.ink : colors.muted,
          fontWeight: "700",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const bodyText = { color: colors.muted, fontSize: 12, lineHeight: 18 } as const;

/* ------------------------------------------------------------ notifications */

function NotificationsSection() {
  const [enabled, setEnabled] = useState(notificationsEnabled());
  const [message, setMessage] = useState<string | null>(null);

  const toggle = async (on: boolean) => {
    const ok = await setNotificationsEnabled(on);
    if (on && !ok) {
      setMessage(
        "Notifications are blocked for TV Time — allow them in iOS Settings → Notifications."
      );
      setEnabled(false);
      return;
    }
    setMessage(
      on ? "You'll be notified when episodes of your shows air." : null
    );
    setEnabled(on);
  };

  return (
    <Section title="Episode notifications">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ ...bodyText, flex: 1, paddingRight: 12 }}>
          Get notified the moment a new episode of a show you follow airs.
          Archived shows stay quiet.
        </Text>
        <Switch
          value={enabled}
          onValueChange={(v) => void toggle(v)}
          trackColor={{ true: colors.accent, false: colors.overlay }}
          thumbColor={colors.ink}
        />
      </View>
      {enabled && (
        <Button
          label="Send test notification"
          onPress={() => {
            void sendTestNotification();
            setMessage("Test scheduled — it should pop up in a few seconds.");
          }}
        />
      )}
      {message && <Text style={bodyText}>{message}</Text>}
    </Section>
  );
}

/* ------------------------------------------------------------------- import */

function ImportSection() {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAndImport = async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["application/zip", "text/csv", "text/comma-separated-values", "*/*"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    setRunning(true);
    try {
      const files: ImportFile[] = [];
      for (const asset of picked.assets) {
        const file = new File(asset.uri);
        if (asset.name.toLowerCase().endsWith(".zip")) {
          files.push({ name: asset.name, bytes: await file.bytes() });
        } else {
          files.push({ name: asset.name, text: await file.text() });
        }
      }
      const parsed = await parseImportFiles(files);
      if (parsed.shows.length === 0) {
        setError(
          parsed.warnings.join(" ") ||
            "No shows found in that file. Expected a TV Time export (zip or CSV)."
        );
        return;
      }
      await runImport(parsed.shows, setProgress);
      await rescheduleAll();
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Section title="Import from TV Time">
      <Text style={bodyText}>
        Pick the data export from the original TV Time app (the zip, or CSVs
        inside it) — from the Files app, iCloud Drive, or wherever you saved
        it. Followed shows and watched episodes carry over.
      </Text>
      <Button
        label={running ? "Importing…" : "Choose export file"}
        primary
        disabled={running}
        onPress={() => void pickAndImport()}
      />
      {progress && (
        <View style={{ gap: 6 }}>
          <View
            style={{
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.overlay,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.round(progress.progress * 100)}%`,
                height: "100%",
                backgroundColor: colors.accent,
              }}
            />
          </View>
          <Text style={bodyText}>{progress.message}</Text>
          {progress.showsFailed.length > 0 && (
            <Text style={{ ...bodyText, color: colors.faint }}>
              Not matched: {progress.showsFailed.join(", ")}
            </Text>
          )}
        </View>
      )}
      {error && (
        <Text style={{ ...bodyText, color: colors.danger }}>{error}</Text>
      )}
    </Section>
  );
}

/* --------------------------------------------------------------------- TMDB */

function TmdbSection() {
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const configured = Boolean(getSetting("tmdb_api_key"));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const trimmed = key.trim();
    const ok = await tmdb.testKey(trimmed);
    if (ok) {
      setSetting("tmdb_api_key", trimmed);
      setMessage("Saved — key verified with TMDB.");
      setKey("");
    } else {
      setMessage("TMDB rejected that key — double-check it and try again.");
    }
    setSaving(false);
  };

  return (
    <Section title="TMDB artwork & episode matching (optional)">
      <Text style={bodyText}>
        Add a free API key from themoviedb.org for higher-quality posters and
        exact episode matching when importing classic TV Time exports.
      </Text>
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder={
          configured ? "Configured — paste to replace" : "Paste your TMDB API key…"
        }
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={{
          backgroundColor: colors.raised,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: colors.fg,
          fontSize: 13,
        }}
      />
      <Button
        label={saving ? "Verifying…" : "Save key"}
        primary
        disabled={saving || key.trim() === ""}
        onPress={() => void save()}
      />
      {message && <Text style={bodyText}>{message}</Text>}
    </Section>
  );
}

/* -------------------------------------------------------------- preferences */

function PreferencesSection() {
  const [spoilers, setSpoilers] = useState(
    getSetting("spoiler_protection") !== "0"
  );
  return (
    <Section title="Preferences">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: colors.fg, fontWeight: "600", fontSize: 13 }}>
            Spoiler protection
          </Text>
          <Text style={bodyText}>
            Hide episode descriptions until you&apos;ve watched them.
          </Text>
        </View>
        <Switch
          value={spoilers}
          onValueChange={(v) => {
            setSetting("spoiler_protection", v ? "1" : "0");
            setSpoilers(v);
          }}
          trackColor={{ true: colors.accent, false: colors.overlay }}
          thumbColor={colors.ink}
        />
      </View>
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
    try {
      const result = await repo.syncStaleShows(0);
      await rescheduleAll();
      setMessage(
        `Done — ${result.synced} shows refreshed${
          result.failed ? `, ${result.failed} failed` : ""
        }.`
      );
    } catch {
      Alert.alert("Sync failed", "Check your connection and try again.");
      setMessage(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Data sync">
      <Text style={bodyText}>
        Air dates refresh automatically on launch and in the background.
        Force a full refresh here.
      </Text>
      <Button
        label={busy ? "Syncing…" : "Sync all shows now"}
        onPress={() => void sync()}
        disabled={busy}
      />
      {message && <Text style={bodyText}>{message}</Text>}
    </Section>
  );
}
