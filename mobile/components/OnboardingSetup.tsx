import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Poster from "@/components/Poster";
import { colors, fonts, radius } from "@/lib/theme";
import { setSetting } from "@/lib/db";
import * as repo from "@/lib/repo";
import * as tvmaze from "@/lib/tvmaze";
import type { CastMember } from "@/lib/tvmaze";
import type { RemoteShow, ShowRow } from "@/lib/types";

/**
 * The setup half of onboarding: pick three favourite shows, then a character
 * from one of them as a profile picture.
 *
 * Picking a show follows AND stars it, so the first minute in the app seeds
 * everything downstream at once — Watch Next has episodes, the Library has a
 * favourites shelf with a ranking, and the profile has a hero banner to draw.
 * Three is the floor because one favourite is not a taste and the
 * recommendation engine seeds from favourites' people.
 *
 * The avatar is stored locally and applied when the account appears. Sign-in
 * is two pages away and optional, and a profile picture chosen before the
 * profile exists has to wait somewhere — pending_avatar_url, consumed by the
 * auth provider on first profile load.
 */

/** Stored for the auth provider to apply on first sign-in. */
export const PENDING_AVATAR_KEY = "pending_avatar_url";

// ---------------------------------------------------------------- pick shows

export function PickShowsPage({
  width,
  height,
  picked,
  onChange,
}: {
  width: number;
  height: number;
  picked: ShowRow[];
  onChange: (shows: ShowRow[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RemoteShow[] | null>(null);
  const [starter, setStarter] = useState<RemoteShow[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const gen = useRef(0);

  // A recognisable grid before anyone types: the same editorial greats list
  // Discover shows, resolved fresh here — this runs once per install, before
  // Discover has ever been opened, so there is no cache to share yet.
  useEffect(() => {
    let alive = true;
    tvmaze
      .getTopRated()
      .then((rated) => {
        if (alive) setStarter(rated.map((r) => r.show).slice(0, 18));
      })
      .catch(() => {
        // offline — search still works, and the page says what to do
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const g = ++gen.current;
    const timer = setTimeout(async () => {
      const r = await tvmaze.searchShows(q).catch(() => []);
      if (g === gen.current) setResults(r);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const pickedIds = useMemo(() => new Set(picked.map((s) => s.id)), [picked]);

  const toggle = async (show: RemoteShow) => {
    if (busyId != null) return;
    if (pickedIds.has(show.id)) {
      repo.unfollowShow(show.id);
      onChange(picked.filter((s) => s.id !== show.id));
      return;
    }
    setBusyId(show.id);
    try {
      // The real follow, episodes and all — the pick IS the library seed,
      // not a wishlist to re-enter later.
      const row = await repo.followShow(show.id);
      if (row) {
        repo.setFavorite(show.id, true);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onChange([...picked, { ...row, favorited_at: new Date().toISOString() }]);
      }
    } catch {
      // offline or TVmaze hiccup — the tile just doesn't select
    } finally {
      setBusyId(null);
    }
  };

  const shown = results ?? starter;
  const cell = (width - 48 - 20) / 3;

  return (
    <View style={{ width, height }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Text style={title}>Pick three favourite shows</Text>
        <Text style={body}>
          They seed your library, your favourites shelf and what gets
          recommended — and one of their characters can be your profile
          picture.
        </Text>

        <View style={searchBox}>
          <Ionicons name="search" size={15} color={colors.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search any show…"
            placeholderTextColor={colors.faint}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            style={{ flex: 1, paddingVertical: 10, color: colors.fg, fontSize: 14 }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={15} color={colors.faint} />
            </Pressable>
          )}
        </View>

        {shown.length === 0 ? (
          <Text style={{ ...body, marginTop: 18 }}>
            {results
              ? "Nothing by that name — try another spelling."
              : "Search for a show you love to get started."}
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            {shown
              .filter((s) => s.posterUrl)
              .map((show) => {
                const selected = pickedIds.has(show.id);
                return (
                  <Pressable
                    key={show.id}
                    onPress={() => void toggle(show)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={show.name}
                    style={{ width: cell }}
                  >
                    <View>
                      <Poster
                        src={show.posterUrl}
                        name={show.name}
                        width={cell}
                        height={cell * 1.45}
                        radius={10}
                      />
                      {selected && (
                        <View style={checkWrap}>
                          <View style={checkBadge}>
                            <Ionicons name="checkmark" size={16} color={colors.ink} />
                          </View>
                        </View>
                      )}
                      {busyId === show.id && (
                        <View style={checkWrap}>
                          <ActivityIndicator color={colors.accent} />
                        </View>
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}
                    >
                      {show.name}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// --------------------------------------------------------------- pick avatar

export function PickAvatarPage({
  width,
  height,
  shows,
}: {
  width: number;
  height: number;
  shows: ShowRow[];
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [cast, setCast] = useState<CastMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const cache = useRef(new Map<number, CastMember[]>());

  const active = shows.find((s) => s.id === activeId) ?? shows[0] ?? null;

  useEffect(() => {
    if (!active) return;
    const hit = cache.current.get(active.id);
    if (hit) {
      setCast(hit);
      return;
    }
    let alive = true;
    setCast(null);
    setFailed(false);
    tvmaze
      .getCast(active.id)
      .then((members) => {
        if (!alive) return;
        cache.current.set(active.id, members);
        setCast(members);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [active]);

  const pick = (url: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChosen(url);
    // Waits for the account: sign-in is a page away and optional, and the
    // auth provider applies this on the first profile load that has no
    // avatar of its own.
    setSetting(PENDING_AVATAR_KEY, url);
  };

  const cell = (width - 48 - 20) / 3;
  const faces = (cast ?? []).filter((m) => m.image);

  return (
    <View style={{ width, height }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={title}>Pick your profile picture</Text>
        <Text style={body}>
          A character from one of your shows. It shows up next to everything
          you watch once you sign in — and you can change it any time.
        </Text>

        {shows.length === 0 ? (
          <Text style={{ ...body, marginTop: 18 }}>
            Pick a show on the previous page first.
          </Text>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 14 }}
            >
              {shows.map((s) => {
                const on = active?.id === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setActiveId(s.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: on ? colors.accent : colors.surface,
                      borderWidth: 1,
                      borderColor: on ? colors.accent : colors.line,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: on ? colors.ink : colors.muted,
                        fontSize: 12,
                        fontWeight: "700",
                        maxWidth: 160,
                      }}
                    >
                      {s.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {cast == null && !failed ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
            ) : failed ? (
              <Text style={{ ...body, marginTop: 8 }}>
                Couldn't load this cast — try another show, or set one later
                from your profile.
              </Text>
            ) : faces.length === 0 ? (
              <Text style={{ ...body, marginTop: 8 }}>
                No character photos for this one — try another of your shows.
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {faces.map((m) => {
                  const on = chosen === m.image;
                  return (
                    <Pressable
                      key={`${m.characterId}-${m.personName}`}
                      onPress={() => pick(m.image!)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={m.characterName}
                      style={{ width: cell }}
                    >
                      <View>
                        <Poster
                          src={m.image}
                          name={m.characterName}
                          width={cell}
                          height={cell * 1.3}
                          radius={10}
                        />
                        {on && (
                          <View style={checkWrap}>
                            <View style={checkBadge}>
                              <Ionicons name="checkmark" size={16} color={colors.ink} />
                            </View>
                          </View>
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}
                      >
                        {m.characterName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ------------------------------------------------------------------- shared

const title = {
  color: colors.fg,
  fontFamily: fonts.display,
  fontSize: 24,
  letterSpacing: -0.4,
  marginTop: 4,
} as const;

const body = {
  color: colors.muted,
  fontSize: 13,
  lineHeight: 19,
  marginTop: 8,
} as const;

const searchBox = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.md,
  paddingHorizontal: 12,
  marginTop: 14,
} as const;

const checkWrap = {
  position: "absolute",
  inset: 0,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(11,12,20,0.45)",
  borderRadius: 10,
} as const;

const checkBadge = {
  width: 30,
  height: 30,
  borderRadius: 15,
  backgroundColor: colors.accent,
  alignItems: "center",
  justifyContent: "center",
} as const;
