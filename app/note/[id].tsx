import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useNotes, parseTopics } from "@/context/NotesContext";
import Colors from "@/constants/colors";

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { notes, folders, updateNote } = useNotes();

  const note = notes.find(n => n.id === id);
  const folder = note ? folders.find(f => f.id === note.folderId) : null;

  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [isEditing, setIsEditing] = useState(false);
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

  const handleSave = () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    updateNote(id!, title, content);
    setIsSaved(true);
    setIsEditing(false);
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
            <View style={styles.folderBadge}>
              <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
              <Text style={[styles.folderBadgeText, { color: folder.color }]}>{folder.name}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {!isSaved && (
            <View style={styles.savingDot} />
          )}
          {isEditing ? (
            <TouchableOpacity style={styles.doneButton} onPress={handleSave}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setIsEditing(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons name="pencil" size={20} color={Colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 60 : 60 + insets.bottom },
        ]}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(300)}>
          {isEditing ? (
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Note title..."
              placeholderTextColor={Colors.textMuted}
              multiline={false}
            />
          ) : (
            <Text style={styles.titleDisplay}>{title}</Text>
          )}
        </Animated.View>

        {isEditing ? (
          <Animated.View entering={FadeIn.delay(100)}>
            <View style={styles.editorHint}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.editorHintText}>
                Separate topics with 3 blank lines
              </Text>
            </View>
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              placeholder={"Topic Title\nYour notes here...\n\n\n\nNext Topic\nMore notes..."}
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
              autoFocus={content.length === 0}
              scrollEnabled={false}
            />
          </Animated.View>
        ) : content.length === 0 ? (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyContent}>
            <Ionicons name="create-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyContentText}>Tap the pencil to start writing</Text>
            <Text style={styles.emptyContentHint}>
              Separate each topic with 3 blank lines for the revision feed
            </Text>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.delay(100)} style={styles.topicsList}>
            <View style={styles.topicsHeader}>
              <Text style={styles.topicsHeaderText}>
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
                    params: {
                      folderId: note.folderId,
                      noteId: note.id,
                      topicIndex: String(i),
                    },
                  });
                }}
                activeOpacity={0.7}
              >
                <View style={styles.topicPreviewLeft}>
                  <View style={styles.topicNumber}>
                    <Text style={styles.topicNumberText}>{i + 1}</Text>
                  </View>
                  <View style={styles.topicPreviewContent}>
                    <Text style={styles.topicPreviewTitle}>{topic.title}</Text>
                    {topic.body.length > 0 && (
                      <Text style={styles.topicPreviewBody} numberOfLines={2}>{topic.body}</Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
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
    backgroundColor: Colors.surface,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  titleInput: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    color: Colors.text,
    marginBottom: 16,
    lineHeight: 36,
  },
  titleDisplay: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    color: Colors.text,
    marginBottom: 16,
    lineHeight: 36,
  },
  editorHint: {
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
    fontSize: 16,
    color: Colors.text,
    lineHeight: 26,
    minHeight: 400,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
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
  topicsHeader: {
    marginBottom: 6,
  },
  topicsHeaderText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
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
  topicPreviewLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  topicNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.accent + "22",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  topicNumberText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: Colors.accent,
  },
  topicPreviewContent: {
    flex: 1,
    gap: 4,
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
