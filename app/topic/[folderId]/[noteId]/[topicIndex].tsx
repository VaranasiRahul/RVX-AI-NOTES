import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown, useSharedValue, withSequence, withTiming, useAnimatedStyle } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { useNotes, parseTopics, SRRating } from "@/context/NotesContext";
import { useTheme } from "@/context/ThemeContext";

export default function TopicDetailScreen() {
  const { folderId, noteId, topicIndex } = useLocalSearchParams<{
    folderId: string;
    noteId: string;
    topicIndex: string;
  }>();
  const insets = useSafeAreaInsets();
  const { notes, folders, markRevised, streak, rateTopic, getTopicProgress } = useNotes();
  const { colors: Colors } = useTheme();

  const note = notes.find((n) => n.id === noteId);
  const folder = folders.find((f) => f.id === folderId);
  const [cachedTopics, setCachedTopics] = useState<{ title: string; body: string }[] | null>(null);

  useEffect(() => {
    if (!noteId || !note?.content) return;
    import('@/lib/topicCache').then(({ getCachedTopics }) => {
      getCachedTopics(noteId, note.content).then(res => {
        setCachedTopics(res || null);
      });
    });
  }, [noteId, note?.content]);

  const topics = cachedTopics || (note ? parseTopics(note) : []);
  const index = parseInt(topicIndex || "0", 10);
  const topic = topics[index];
  const progress = note ? getTopicProgress(note.id, index) : null;

  const today = new Date().toISOString().split("T")[0];
  const alreadyRevised = streak.history.includes(today);
  const [ratingDone, setRatingDone] = useState(!!progress?.lastRating);

  // ── HOOKS MUST BE ABOVE ALL EARLY RETURNS ──
  const ratingScale = useSharedValue(1);
  const ratingAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ratingScale.value }],
  }));

  useEffect(() => {
    if (!alreadyRevised) markRevised();
  }, []);

  useEffect(() => {
    setRatingDone(!!progress?.lastRating);
  }, [progress]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!topic || !note) {
    return (
      <View style={[styles.container, { paddingTop: topPad, backgroundColor: Colors.background }]}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.errorText, { color: Colors.error }]}>Topic not found</Text>
      </View>
    );
  }

  const hasPrev = index > 0;
  const hasNext = index < topics.length - 1;

  const goToPrev = () => {
    if (!hasPrev) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace({
      pathname: "/topic/[folderId]/[noteId]/[topicIndex]",
      params: { folderId: folderId!, noteId: noteId!, topicIndex: String(index - 1) },
    });
  };

  const goToNext = () => {
    if (!hasNext) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace({
      pathname: "/topic/[folderId]/[noteId]/[topicIndex]",
      params: { folderId: folderId!, noteId: noteId!, topicIndex: String(index + 1) },
    });
  };

  const handleRate = async (rating: SRRating) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    ratingScale.value = withSequence(withTiming(0.95, { duration: 80 }), withTiming(1, { duration: 120 }));
    await rateTopic(note.id, index, rating);
    setRatingDone(true);
    setRatingDone(true);
  };

  const markdownStyles = StyleSheet.create({
    body: { fontFamily: "DMSans_400Regular", fontSize: 17, color: Colors.textSecondary, lineHeight: 28, backgroundColor: "transparent" },
    heading1: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, color: Colors.text, marginTop: 24, marginBottom: 10, lineHeight: 34 },
    heading2: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: Colors.text, marginTop: 20, marginBottom: 8, lineHeight: 30 },
    heading3: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 19, color: Colors.text, marginTop: 16, marginBottom: 6, lineHeight: 27 },
    heading4: { fontFamily: "DMSans_600SemiBold", fontSize: 17, color: Colors.text, marginTop: 14, marginBottom: 4 },
    paragraph: { fontFamily: "DMSans_400Regular", fontSize: 17, color: Colors.textSecondary, lineHeight: 28, marginBottom: 12 },
    strong: { fontFamily: "DMSans_600SemiBold", color: Colors.text },
    em: { fontStyle: "italic", color: Colors.textSecondary },
    s: { textDecorationLine: "line-through", color: Colors.textMuted },
    code_inline: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 14, backgroundColor: Colors.surfaceElevated, color: Colors.accentLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    fence: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 13, backgroundColor: Colors.surfaceElevated, color: Colors.accentLight, padding: 16, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: Colors.accent, marginVertical: 12, lineHeight: 20 },
    blockquote: { backgroundColor: Colors.accent + "10", borderLeftWidth: 3, borderLeftColor: Colors.accent, paddingLeft: 16, paddingVertical: 8, marginVertical: 10, borderRadius: 4 },
    bullet_list: { marginBottom: 12 },
    ordered_list: { marginBottom: 12 },
    list_item: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
    bullet_list_icon: { marginRight: 8, marginTop: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
    ordered_list_icon: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: Colors.accent, marginRight: 8, minWidth: 20 },
    hr: { backgroundColor: Colors.border, height: 1, marginVertical: 20 },
    link: { color: Colors.accent, textDecorationLine: "underline" },
    table: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginVertical: 12, overflow: "hidden" },
    thead: { backgroundColor: Colors.surfaceElevated },
    th: { fontFamily: "DMSans_600SemiBold", fontSize: 13, color: Colors.text, padding: 10, borderRightWidth: 1, borderRightColor: Colors.border },
    tr: { borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: "row" },
    td: { fontFamily: "DMSans_400Regular", fontSize: 13, color: Colors.textSecondary, padding: 10, borderRightWidth: 1, borderRightColor: Colors.border, flex: 1 },
  });

  const ratingButtons: { label: string; rating: SRRating; color: string; icon: string }[] = [
    { label: "Again", rating: "again", color: Colors.error, icon: "refresh" },
    { label: "Hard", rating: "hard", color: Colors.warning, icon: "alert-circle-outline" },
    { label: "Good", rating: "good", color: Colors.accent, icon: "thumbs-up-outline" },
  ];

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: Colors.background }]}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(300)} style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity style={styles.closeButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}>
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {folder && (
            <View style={[styles.folderBadge, { backgroundColor: folder.color + "20" }]}>
              <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
              <Text style={[styles.folderBadgeText, { color: folder.color }]}>{folder.name}</Text>
            </View>
          )}
          <Text style={[styles.topicCounter, { color: Colors.textMuted }]}>{index + 1} of {topics.length}</Text>
        </View>
        <TouchableOpacity style={styles.editButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/note/[id]", params: { id: note.id } }); }}>
          <Ionicons name="create-outline" size={20} color={Colors.accent} />
        </TouchableOpacity>
      </Animated.View>

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === "web" ? 180 : 180 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={[styles.noteLabelText, { color: Colors.textMuted }]}>{note.title}</Text>
          <Markdown style={{ body: { margin: 0, padding: 0 }, paragraph: [styles.topicTitle, { color: Colors.text, margin: 0, padding: 0 }] } as any}>{topic.title}</Markdown>
          {topic.body.length > 0 ? (
            <Markdown style={markdownStyles as any}>{topic.body}</Markdown>
          ) : (
            <Text style={[styles.topicBodyEmpty, { color: Colors.textMuted }]}>No additional content for this topic.</Text>
          )}
        </Animated.View>
      </ScrollView>

      {/* SR Rating Bar */}
      <Animated.View
        entering={FadeIn.delay(300)}
        style={[styles.ratingSection, { backgroundColor: Colors.background, borderTopColor: Colors.border }]}
      >
        <Text style={[styles.ratingLabel, { color: Colors.textMuted }]}>
          {ratingDone ? (progress?.lastRating ? `Rated: ${progress.lastRating} · next in ${progress?.interval ?? 1}d` : "Rate this topic") : "How well did you know this?"}
        </Text>
        <Animated.View style={[styles.ratingRow, ratingDone ? ratingAnimStyle : {}]}>
          {ratingButtons.map(({ label, rating, color, icon }) => (
            <TouchableOpacity
              key={rating}
              style={[
                styles.ratingBtn,
                {
                  backgroundColor: progress?.lastRating === rating ? color + "30" : Colors.surface,
                  borderColor: progress?.lastRating === rating ? color : Colors.border,
                },
              ]}
              onPress={() => handleRate(rating)}
              activeOpacity={0.75}
            >
              <Ionicons name={icon as any} size={14} color={progress?.lastRating === rating ? color : Colors.textMuted} />
              <Text style={[styles.ratingBtnText, { color: progress?.lastRating === rating ? color : Colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </Animated.View>

      {/* Nav Bar */}
      <Animated.View
        entering={FadeIn.delay(400)}
        style={[styles.navBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 12, borderTopColor: Colors.border, backgroundColor: Colors.background }]}
      >
        <TouchableOpacity style={[styles.navBtn, { backgroundColor: Colors.surface, borderColor: Colors.border }, !hasPrev && styles.navBtnDisabled]} onPress={goToPrev} disabled={!hasPrev}>
          <Ionicons name="arrow-back" size={18} color={hasPrev ? Colors.text : Colors.textMuted} />
          <Text style={[styles.navBtnText, { color: hasPrev ? Colors.text : Colors.textMuted }]}>Prev</Text>
        </TouchableOpacity>
        <View style={[styles.revisedBadge, { backgroundColor: Colors.success + "15" }]}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          <Text style={[styles.revisedText, { color: Colors.success }]}>Revised</Text>
        </View>
        <TouchableOpacity style={[styles.navBtn, { backgroundColor: Colors.surface, borderColor: Colors.border }, !hasNext && styles.navBtnDisabled]} onPress={goToNext} disabled={!hasNext}>
          <Text style={[styles.navBtnText, { color: hasNext ? Colors.text : Colors.textMuted }]}>Next</Text>
          <Ionicons name="arrow-forward" size={18} color={hasNext ? Colors.text : Colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 4 },
  closeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", gap: 3 },
  folderBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  folderDot: { width: 6, height: 6, borderRadius: 3 },
  folderBadgeText: { fontFamily: "DMSans_500Medium", fontSize: 11 },
  topicCounter: { fontFamily: "DMSans_400Regular", fontSize: 11 },
  editButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 28 },
  noteLabelText: { fontFamily: "DMSans_500Medium", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  topicTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 30, lineHeight: 40, marginBottom: 20, letterSpacing: 0.2 },
  topicBodyEmpty: { fontFamily: "DMSans_400Regular", fontSize: 16, fontStyle: "italic" },
  // SR Rating
  ratingSection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, borderTopWidth: 1, gap: 8 },
  ratingLabel: { fontFamily: "DMSans_400Regular", fontSize: 11, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.8 },
  ratingRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  ratingBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flex: 1, justifyContent: "center" },
  ratingBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 12 },
  // Nav
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12, paddingHorizontal: 20, borderTopWidth: 1 },
  navBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, minWidth: 90, justifyContent: "center" },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  revisedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  revisedText: { fontFamily: "DMSans_500Medium", fontSize: 12 },
  errorText: { fontFamily: "DMSans_400Regular", fontSize: 16, textAlign: "center", marginTop: 40 },
});
