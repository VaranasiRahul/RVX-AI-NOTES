import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
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
    backgroundColor: "transparent",
  },
  heading1: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginTop: 20,
    marginBottom: 8,
    lineHeight: 30,
  },
  heading2: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 19,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 6,
    lineHeight: 26,
  },
  heading3: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    marginTop: 14,
    marginBottom: 4,
  },
  paragraph: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: 10,
  },
  strong: {
    fontFamily: "DMSans_600SemiBold",
    color: Colors.text,
  },
  em: {
    fontStyle: "italic",
    color: Colors.textSecondary,
  },
  code_inline: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    backgroundColor: Colors.surfaceElevated,
    color: Colors.accentLight,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  fence: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    backgroundColor: Colors.surfaceElevated,
    color: Colors.accentLight,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    marginVertical: 8,
    lineHeight: 20,
  },
  blockquote: {
    backgroundColor: Colors.accent + "10",
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    paddingLeft: 12,
    paddingVertical: 6,
    marginVertical: 8,
    borderRadius: 4,
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  list_item: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  bullet_list_icon: {
    marginRight: 8,
    marginTop: 9,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  ordered_list_icon: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
    marginRight: 8,
    minWidth: 20,
  },
  hr: {
    backgroundColor: Colors.border,
    height: 1,
    marginVertical: 14,
  },
  link: {
    color: Colors.accent,
    textDecorationLine: "underline",
  },
});

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { notes, folders, updateNote } = useNotes();

  const note = notes.find(n => n.id === id);
  const folder = note ? folders.find(f => f.id === note.folderId) : null;

  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [mode, setMode] = useState<"topics" | "edit" | "preview">("topics");
  const [isSaved, setIsSaved] = useState(true);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const topics = content ? parseTopics({ ...note!, content }) : [];

  useEffect(() => {
    if (!note) return;
    if (content === note.content && title === note.title) {
      setIsSaved(true);
      return;
    }
    setIsSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      updateNote(id!, title, content);
      setIsSaved(true);
    }, 800);
  }, [content, title]);

  const handleDone = () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    updateNote(id!, title, content);
    setIsSaved(true);
    setMode("topics");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (!note) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Text style={styles.errorText}>Note not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity
          onPress={() => {
            if (!isSaved) updateNote(id!, title, content);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {folder && (
            <View style={[styles.folderBadge, { backgroundColor: folder.color + '20' }]}>
              <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
              <Text style={[styles.folderBadgeText, { color: folder.color }]}>{folder.name}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          {!isSaved && <View style={styles.savingDot} />}
          {mode === "edit" ? (
            <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          ) : mode === "preview" ? (
            <TouchableOpacity
              onPress={() => { setMode("edit"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name="pencil" size={20} color={Colors.accent} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => { setMode("edit"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name="pencil" size={20} color={Colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {mode !== "topics" && (
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, mode === "edit" && styles.modeTabActive]}
            onPress={() => { setMode("edit"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="create-outline" size={14} color={mode === "edit" ? Colors.background : Colors.textMuted} />
            <Text style={[styles.modeTabText, mode === "edit" && styles.modeTabTextActive]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, mode === "preview" && styles.modeTabActive]}
            onPress={() => { setMode("preview"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="eye-outline" size={14} color={mode === "preview" ? Colors.background : Colors.textMuted} />
            <Text style={[styles.modeTabText, mode === "preview" && styles.modeTabTextActive]}>Preview</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 60 : 60 + insets.bottom },
        ]}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {mode === "edit" ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Note title..."
              placeholderTextColor={Colors.textMuted}
              multiline={false}
            />
            <View style={styles.editorHintRow}>
              <Ionicons name="logo-markdown" size={14} color={Colors.textMuted} />
              <Text style={styles.editorHintText}>Markdown supported · Separate topics with 3 blank lines</Text>
            </View>
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              placeholder={"## Topic Title\nYour notes here...\n\nUse **bold**, *italic*, `code`\n\n\n\n## Next Topic\nMore notes..."}
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
              autoFocus={content.length === 0}
              scrollEnabled={false}
            />
          </Animated.View>
        ) : mode === "preview" ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Text style={styles.titleDisplay}>{title}</Text>
            {content.length > 0 ? (
              <Markdown style={markdownStyles as any}>{content}</Markdown>
            ) : (
              <Text style={styles.emptyPreviewText}>Nothing to preview yet.</Text>
            )}
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)}>
            <TextInput
              style={styles.titleDisplay}
              value={title}
              onChangeText={setTitle}
              placeholder="Note title..."
              placeholderTextColor={Colors.textMuted}
              editable={false}
            />

            {content.length === 0 ? (
              <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyContent}>
                <Ionicons name="create-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyContentText}>Tap the pencil to start writing</Text>
                <Text style={styles.emptyContentHint}>
                  Supports Markdown · Separate topics with 3 blank lines
                </Text>
              </Animated.View>
            ) : (
              <View style={styles.topicsList}>
                <View style={styles.topicsCountRow}>
                  <Ionicons name="list" size={14} color={Colors.textMuted} />
                  <Text style={styles.topicsCountText}>
                    {topics.length} {topics.length === 1 ? "topic" : "topics"} detected
                  </Text>
                </View>
                {topics.map((topic, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.topicPreviewCard}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({
                        pathname: "/topic/[folderId]/[noteId]/[topicIndex]",
                        params: { folderId: note.folderId, noteId: note.id, topicIndex: String(i) },
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.topicNumberBadge}>
                      <Text style={styles.topicNumberText}>{i + 1}</Text>
                    </View>
                    <View style={styles.topicPreviewContent}>
                      <Text style={styles.topicPreviewTitle}>{topic.title}</Text>
                      {topic.body.length > 0 && (
                        <Text style={styles.topicPreviewBody} numberOfLines={2}>{topic.body.replace(/[#*_`>]/g, '').trim()}</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  folderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    fontSize: 12,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 60,
    justifyContent: "flex-end",
  },
  savingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  doneButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  doneButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
  modeTabs: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeTabActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  modeTabText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
  },
  modeTabTextActive: {
    color: Colors.background,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  titleInput: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 26,
    color: Colors.text,
    marginBottom: 14,
    lineHeight: 34,
  },
  titleDisplay: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 26,
    color: Colors.text,
    marginBottom: 14,
    lineHeight: 34,
  },
  editorHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  editorHintText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  contentInput: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.text,
    lineHeight: 26,
    minHeight: 400,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyPreviewText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  emptyContent: {
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
  },
  emptyContentText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  emptyContentHint: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  topicsList: {
    gap: 8,
  },
  topicsCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  topicsCountText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  topicPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  topicNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.accent + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  topicNumberText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
  topicPreviewContent: {
    flex: 1,
    gap: 3,
  },
  topicPreviewTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  topicPreviewBody: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  errorText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    color: Colors.error,
    textAlign: "center",
    marginTop: 40,
  },
});
