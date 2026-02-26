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
import { useNotes, parseTopics } from "@/context/NotesContext";
import Colors from "@/constants/colors";

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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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
          <Text style={styles.topicCounter}>
            {index + 1} of {topics.length}
          </Text>
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
          <View style={styles.noteTitle}>
            <Text style={styles.noteTitleText}>{note.title}</Text>
          </View>

          <Text style={styles.topicTitle}>{topic.title}</Text>

          {topic.body.length > 0 ? (
            <Text style={styles.topicBody}>{topic.body}</Text>
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
          <Ionicons name="arrow-back" size={20} color={hasPrev ? Colors.text : Colors.textMuted} />
          <Text style={[styles.navBtnText, !hasPrev && styles.navBtnTextDisabled]}>Previous</Text>
        </TouchableOpacity>

        <View style={styles.navCenter}>
          {!alreadyRevised ? (
            <View style={styles.markRevised}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.markRevisedText}>Marked as revised</Text>
            </View>
          ) : (
            <View style={styles.markRevised}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.markRevisedText}>Revised today</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.navBtn, !hasNext && styles.navBtnDisabled]}
          onPress={goToNext}
          disabled={!hasNext}
        >
          <Text style={[styles.navBtnText, !hasNext && styles.navBtnTextDisabled]}>Next</Text>
          <Ionicons name="arrow-forward" size={20} color={hasNext ? Colors.text : Colors.textMuted} />
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
    gap: 4,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  noteTitle: {
    marginBottom: 20,
  },
  noteTitleText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  topicTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 32,
    color: Colors.text,
    lineHeight: 40,
    marginBottom: 24,
    letterSpacing: 0.2,
  },
  topicBody: {
    fontFamily: "DMSans_400Regular",
    fontSize: 17,
    color: Colors.textSecondary,
    lineHeight: 28,
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
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 100,
    justifyContent: "center",
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  navBtnTextDisabled: {
    color: Colors.textMuted,
  },
  navCenter: {
    flex: 1,
    alignItems: "center",
  },
  markRevised: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  markRevisedText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: Colors.success,
  },
  backButton: {
    margin: 16,
  },
  errorText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    color: Colors.error,
    textAlign: "center",
    marginTop: 40,
  },
});
