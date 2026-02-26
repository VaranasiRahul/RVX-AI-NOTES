import React, { useEffect } from "react";
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
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { useNotes, parseTopics } from "@/context/NotesContext";
import Colors from "@/constants/colors";

const markdownStyles = StyleSheet.create({
  body: {
    fontFamily: "DMSans_400Regular",
    fontSize: 17,
    color: Colors.textSecondary,
    lineHeight: 28,
    backgroundColor: "transparent",
  },
  heading1: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 26,
    color: Colors.text,
    marginTop: 24,
    marginBottom: 10,
    lineHeight: 34,
  },
  heading2: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginTop: 20,
    marginBottom: 8,
    lineHeight: 30,
  },
  heading3: {
    fontFamily: "PlayfairDisplay_600SemiBold",
    fontSize: 19,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 6,
    lineHeight: 27,
  },
  heading4: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    marginTop: 14,
    marginBottom: 4,
  },
  heading5: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  heading6: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    fontFamily: "DMSans_400Regular",
    fontSize: 17,
    color: Colors.textSecondary,
    lineHeight: 28,
    marginBottom: 12,
  },
  strong: {
    fontFamily: "DMSans_600SemiBold",
    color: Colors.text,
  },
  em: {
    fontStyle: "italic",
    color: Colors.textSecondary,
  },
  s: {
    textDecorationLine: "line-through",
    color: Colors.textMuted,
  },
  code_inline: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 14,
    backgroundColor: Colors.surfaceElevated,
    color: Colors.accentLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fence: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    backgroundColor: Colors.surfaceElevated,
    color: Colors.accentLight,
    padding: 16,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    marginVertical: 12,
    lineHeight: 20,
  },
  code_block: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    backgroundColor: Colors.surfaceElevated,
    color: Colors.accentLight,
    padding: 16,
    borderRadius: 10,
    marginVertical: 12,
    lineHeight: 20,
  },
  blockquote: {
    backgroundColor: Colors.accent + "10",
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    paddingLeft: 16,
    paddingVertical: 8,
    marginVertical: 10,
    borderRadius: 4,
  },
  bullet_list: {
    marginBottom: 12,
  },
  ordered_list: {
    marginBottom: 12,
  },
  list_item: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  bullet_list_icon: {
    marginRight: 8,
    marginTop: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  ordered_list_icon: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.accent,
    marginRight: 8,
    minWidth: 20,
  },
  hr: {
    backgroundColor: Colors.border,
    height: 1,
    marginVertical: 20,
  },
  link: {
    color: Colors.accent,
    textDecorationLine: "underline",
  },
  table: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    marginVertical: 12,
    overflow: "hidden",
  },
  thead: {
    backgroundColor: Colors.surfaceElevated,
  },
  th: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
  },
  td: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    flex: 1,
  },
});

export default function TopicDetailScreen() {
  const { folderId, noteId, topicIndex } = useLocalSearchParams<{
    folderId: string;
    noteId: string;
    topicIndex: string;
  }>();
  const insets = useSafeAreaInsets();
  const { notes, folders, markRevised, streak } = useNotes();

  const note = notes.find(n => n.id === noteId);
  const folder = folders.find(f => f.id === folderId);
  const topics = note ? parseTopics(note) : [];
  const index = parseInt(topicIndex || "0", 10);
  const topic = topics[index];

  const today = new Date().toISOString().split('T')[0];
  const alreadyRevised = streak.history.includes(today);

  useEffect(() => {
    if (!alreadyRevised) {
      markRevised();
    }
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!topic || !note) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.errorText}>Topic not found</Text>
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

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {folder && (
            <View style={[styles.folderBadge, { backgroundColor: folder.color + '20' }]}>
              <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
              <Text style={[styles.folderBadgeText, { color: folder.color }]}>{folder.name}</Text>
            </View>
          )}
          <Text style={styles.topicCounter}>{index + 1} of {topics.length}</Text>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: "/note/[id]", params: { id: note.id } });
          }}
        >
          <Ionicons name="create-outline" size={20} color={Colors.accent} />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 100 : 100 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.noteLabelText}>{note.title}</Text>
          <Text style={styles.topicTitle}>{topic.title}</Text>

          {topic.body.length > 0 ? (
            <Markdown style={markdownStyles as any}>
              {topic.body}
            </Markdown>
          ) : (
            <Text style={styles.topicBodyEmpty}>No additional content for this topic.</Text>
          )}
        </Animated.View>
      </ScrollView>

      <Animated.View
        entering={FadeIn.delay(400)}
        style={[styles.navBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 12 }]}
      >
        <TouchableOpacity
          style={[styles.navBtn, !hasPrev && styles.navBtnDisabled]}
          onPress={goToPrev}
          disabled={!hasPrev}
        >
          <Ionicons name="arrow-back" size={18} color={hasPrev ? Colors.text : Colors.textMuted} />
          <Text style={[styles.navBtnText, !hasPrev && styles.navBtnTextMuted]}>Prev</Text>
        </TouchableOpacity>

        <View style={styles.revisedBadge}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          <Text style={styles.revisedText}>Revised</Text>
        </View>

        <TouchableOpacity
          style={[styles.navBtn, !hasNext && styles.navBtnDisabled]}
          onPress={goToNext}
          disabled={!hasNext}
        >
          <Text style={[styles.navBtnText, !hasNext && styles.navBtnTextMuted]}>Next</Text>
          <Ionicons name="arrow-forward" size={18} color={hasNext ? Colors.text : Colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  folderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  folderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  folderBadgeText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
  },
  topicCounter: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  editButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  noteLabelText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  topicTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 30,
    color: Colors.text,
    lineHeight: 40,
    marginBottom: 20,
    letterSpacing: 0.2,
  },
  topicBodyEmpty: {
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 90,
    justifyContent: "center",
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  navBtnTextMuted: { color: Colors.textMuted },
  revisedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.success + "15",
  },
  revisedText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.success,
  },
  errorText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    color: Colors.error,
    textAlign: "center",
    marginTop: 40,
  },
});
