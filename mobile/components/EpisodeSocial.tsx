import { useCallback, useEffect, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import GifPicker from "@/components/GifPicker";
import StarRating from "@/components/StarRating";
import { card, sectionLabel } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as social from "@/lib/social/api";
import { confirmBlock, reportWithFeedback } from "@/lib/social/moderation";
import { shortAgo } from "@/lib/format-social";
import type { Comment, EpisodeStats, Profile } from "@/lib/social/types";

/**
 * The social block on an episode page: community rating, friends who watched,
 * and the comment thread (text + photo + upvotes). Only shown when signed in.
 */
export default function EpisodeSocial({
  showId,
  season,
  episode,
  showName,
  posterUrl,
  episodeName,
}: {
  showId: number;
  season: number;
  episode: number;
  showName: string | null;
  posterUrl: string | null;
  episodeName?: string | null;
}) {
  const { session } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<EpisodeStats | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, f, c] = await Promise.all([
      social.episodeStats(showId, season, episode),
      social.friendsWhoWatched(showId, season, episode),
      social.getComments(showId, season, episode),
    ]);
    setStats(s);
    setFriends(f);
    setComments(c);
    setLoading(false);
  }, [showId, season, episode]);

  useEffect(() => {
    if (session) void load();
    else setLoading(false);
  }, [session, load]);

  if (!session) {
    return (
      <View style={{ ...card, padding: 16, alignItems: "center", gap: 4 }}>
        <Ionicons name="chatbubbles-outline" size={22} color={colors.faint} />
        <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
          Sign in (Profile tab) to rate with friends, see who&apos;s watched,
          and join the discussion.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ ...card, padding: 20, alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Community rating + friends who watched */}
      <View style={{ ...card, padding: 14, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={label}>COMMUNITY</Text>
          {stats && stats.ratingCount > 0 && stats.avgRating != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <StarRating value={stats.avgRating} size={16} readOnly />
              <Text style={{ color: colors.accent, fontFamily: fonts.display, fontSize: 14 }}>
                {stats.avgRating.toFixed(1)}
              </Text>
              <Text style={{ color: colors.faint, fontSize: 11 }}>
                ({stats.ratingCount})
              </Text>
            </View>
          ) : (
            <Text style={{ color: colors.faint, fontSize: 12 }}>No ratings yet</Text>
          )}
        </View>
        {friends.length > 0 && (
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            onPress={() => friends[0] && router.push(`/u/${friends[0].username}` as never)}
          >
            <View style={{ flexDirection: "row" }}>
              {friends.slice(0, 4).map((f, i) => (
                <View key={f.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                  <Avatar name={f.display_name || f.username} url={f.avatar_url} size={26} />
                </View>
              ))}
            </View>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {friendsWatchedText(friends)}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Comments */}
      <View style={{ ...card, padding: 14, gap: 12 }}>
        <Text style={label}>DISCUSSION</Text>
        <CommentComposer
          onPost={async (body, uri, gifUrl) => {
            // A GIF is already a hosted URL — use it directly. A photo needs
            // uploading to our storage first.
            let imageUrl: string | null = gifUrl;
            if (!imageUrl && uri) imageUrl = await social.uploadCommentPhoto(uri);
            await social.addComment(showId, season, episode, body, imageUrl, {
              showName,
              posterUrl,
              episodeName,
            });
            await load();
          }}
        />
        {comments.length === 0 ? (
          <Text style={{ color: colors.faint, fontSize: 12, textAlign: "center", paddingVertical: 8 }}>
            No comments yet — start the conversation.
          </Text>
        ) : (
          comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              isOwn={c.user_id === session.user.id}
              onOpenUser={(u) => router.push(`/u/${u}` as never)}
              onChanged={load}
              onUpvote={async () => {
                await social.toggleUpvote(c.id, c.upvoted);
                setComments((prev) =>
                  prev.map((x) =>
                    x.id === c.id
                      ? { ...x, upvoted: !x.upvoted, upvotes: x.upvotes + (x.upvoted ? -1 : 1) }
                      : x
                  )
                );
              }}
            />
          ))
        )}
      </View>
    </View>
  );
}

function friendsWatchedText(friends: Profile[]): string {
  const names = friends.map((f) => f.display_name || f.username);
  if (names.length === 1) return `${names[0]} watched this`;
  if (names.length === 2) return `${names[0]} and ${names[1]} watched this`;
  return `${names[0]}, ${names[1]} and ${friends.length - 2} more watched this`;
}

function CommentComposer({
  onPost,
}: {
  onPost: (
    body: string,
    uri: string | null,
    gifUrl: string | null
  ) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [uri, setUri] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  // A photo and a GIF are mutually exclusive — one attachment per comment.
  const preview = gifUrl ?? uri;

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: false,
    });
    if (!res.canceled && res.assets[0]) {
      setUri(res.assets[0].uri);
      setGifUrl(null);
    }
  };

  const post = async () => {
    if (!body.trim() && !uri && !gifUrl) return;
    setPosting(true);
    try {
      await onPost(body, uri, gifUrl);
      setBody("");
      setUri(null);
      setGifUrl(null);
    } catch {
      Alert.alert("Couldn't post", "Please try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onSelect={(url) => {
          setGifUrl(url);
          setUri(null);
        }}
      />
      {preview && (
        <View style={{ alignSelf: "flex-start" }}>
          <Image
            source={{ uri: preview }}
            style={{ width: 80, height: 80, borderRadius: 10 }}
            contentFit="cover"
          />
          <Pressable
            onPress={() => {
              setUri(null);
              setGifUrl(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
            style={{ position: "absolute", top: -6, right: -6, backgroundColor: colors.ink, borderRadius: 10 }}
          >
            <Ionicons name="close-circle" size={20} color={colors.fg} />
          </Pressable>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: colors.raised,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            paddingHorizontal: 12,
          }}
        >
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Add a comment…"
            placeholderTextColor={colors.faint}
            multiline
            style={{ flex: 1, color: colors.fg, fontSize: 14, paddingVertical: 10, maxHeight: 100 }}
          />
          <Pressable
            onPress={() => setGifOpen(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Add a GIF"
            style={{
              borderWidth: 1,
              borderColor: colors.lineStrong,
              borderRadius: 6,
              paddingHorizontal: 5,
              paddingVertical: 1,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>
              GIF
            </Text>
          </Pressable>
          <Pressable
            onPress={pickImage}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
          >
            <Ionicons name="image-outline" size={20} color={colors.muted} />
          </Pressable>
        </View>
        <Bouncy
          onPress={post}
          disabled={posting || (!body.trim() && !uri)}
          scaleTo={0.9}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
            opacity: posting || (!body.trim() && !uri) ? 0.5 : 1,
          }}
        >
          <Ionicons name="arrow-up" size={20} color={colors.ink} />
        </Bouncy>
      </View>
    </View>
  );
}

function CommentRow({
  comment: c,
  isOwn,
  onUpvote,
  onOpenUser,
  onChanged,
}: {
  comment: Comment;
  isOwn: boolean;
  onUpvote: () => void;
  onOpenUser: (username: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const name = c.display_name || c.username || "Someone";

  // Moderation menu — delete your own comment; report or block for others'
  // (App Store Guideline 1.2 requires both for user-generated content).
  const openMenu = () => {
    const options = isOwn
      ? ["Delete comment", "Cancel"]
      : [`Report comment`, `Block ${name}`, "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: isOwn ? 0 : 1,
        userInterfaceStyle: "dark",
      },
      async (i) => {
        try {
          if (isOwn && i === 0) {
            await social.deleteComment(c.id, c.image_url);
            await onChanged();
          } else if (!isOwn && i === 0) {
            await reportWithFeedback({ commentId: c.id, userId: c.user_id });
          } else if (!isOwn && i === 1) {
            confirmBlock(name, c.user_id, onChanged);
          }
        } catch {
          Alert.alert("Something went wrong", "Please try again.");
        }
      }
    );
  };

  return (
    <View style={{ flexDirection: "row", gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
      <Pressable onPress={() => c.username && onOpenUser(c.username)}>
        <Avatar name={name} url={c.avatar_url} size={34} />
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 13, flex: 1 }} numberOfLines={1}>
            <Text
              style={{ color: colors.fg, fontFamily: fonts.displayMedium }}
              onPress={() => c.username && onOpenUser(c.username)}
            >
              {name}
            </Text>
            <Text style={{ color: colors.faint }}>  {shortAgo(c.created_at)}</Text>
          </Text>
          <Pressable
            onPress={openMenu}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={
              isOwn ? "Comment options" : `Report or block ${name}`
            }
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.faint} />
          </Pressable>
        </View>
        {c.body ? (
          <Text style={{ color: colors.fg, fontSize: 14, lineHeight: 19 }}>{c.body}</Text>
        ) : null}
        {c.image_url ? (
          <Image
            source={{ uri: c.image_url }}
            style={{ width: "100%", height: 200, borderRadius: 12, backgroundColor: colors.raised }}
            contentFit="cover"
          />
        ) : null}
      </View>
      <Pressable
        onPress={onUpvote}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={c.upvoted ? "Remove upvote" : "Upvote"}
        style={{ alignItems: "center", gap: 2 }}
      >
        <Ionicons
          name={c.upvoted ? "arrow-up-circle" : "arrow-up-circle-outline"}
          size={24}
          color={c.upvoted ? colors.accent : colors.faint}
        />
        {c.upvotes > 0 && (
          <Text style={{ color: c.upvoted ? colors.accent : colors.faint, fontSize: 11, fontWeight: "700" }}>
            {c.upvotes}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const label = sectionLabel;
