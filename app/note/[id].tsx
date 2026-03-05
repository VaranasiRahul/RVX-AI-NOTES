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
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { useNotes, parseTopics, runAiAnalysis } from "@/context/NotesContext";
import { useTheme } from "@/context/ThemeContext";

const MARKDOWN_TOOLBAR = [
  { label: "B", wrap: ["**", "**"], placeholder: "bold text", icon: null },
  { label: "I", wrap: ["*", "*"], placeholder: "italic text", icon: null },
  { label: "H", wrap: ["## ", ""], placeholder: "Heading", icon: null },
  { label: "`", wrap: ["`", "`"], placeholder: "code", icon: null },
  { label: "—", wrap: ["- ", ""], placeholder: "list item", icon: null },
  { label: ">", wrap: ["> ", ""], placeholder: "quote", icon: null },
];

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { notes, folders, updateNote, analyzeNoteWithAI, geminiApiKey } = useNotes();
  const { colors: Colors } = useTheme();

  const note = notes.find((n) => n.id === id);
  const folder = note ? folders.find((f) => f.id === note.folderId) : null;

  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [mode, setMode] = useState<"topics" | "edit" | "preview">("topics");
  const [isSaved, setIsSaved] = useState(true);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [cachedTopics, setCachedTopics] = useState<{ title: string; body: string }[] | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentInputRef = useRef<TextInput>(null);
  const aiLockRef = useRef(false); // synchronous guard — prevents multiple API calls on rapid taps

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Try to load cached AI topics asynchronously
  useEffect(() => {
    if (!id || !content) return;
    import('@/lib/topicCache').then(({ getCachedTopics }) => {
      getCachedTopics(id, content).then(res => {
        setCachedTopics(res || null);
      });
    });
  }, [id, content]);

  const topics = cachedTopics || (content ? parseTopics({ ...note!, content }) : []);

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

    // Auto-generate AI summaries in the background when closing the editor
    if (geminiApiKey && content.trim().length > 10) {
      setTimeout(() => {
        runAiAnalysis(id!, content, geminiApiKey).catch(e => console.warn('Background AI skipped/failed:', e));
      }, 500);
    }
  };

  const handleAnalyzeWithAI = async () => {
    // aiLockRef is checked SYNCHRONOUSLY before any await, preventing double-tap race conditions.
    // aiAnalyzing state alone is NOT enough because state updates are async — a second tap can
    // sneak through in the gap between the check and setAiAnalyzing(true).
    if (!id || !content || aiLockRef.current) return;
    aiLockRef.current = true;  // lock immediately, before any await
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Save first so analysis uses latest content
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    await updateNote(id, title, content);
    setAiAnalyzing(true);
    setAiStatus('Starting…');
    try {
      const generated = await analyzeNoteWithAI(id, content, (msg) => setAiStatus(msg));
      setCachedTopics(generated);
      setAiStatus('Done ✓');
      setMode('topics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setAiStatus('Error: ' + (e?.message ?? 'failed'));
    } finally {
      aiLockRef.current = false; // release lock
      setAiAnalyzing(false);
      setTimeout(() => setAiStatus(null), 3000);
    }
  };

  const insertMarkdown = (wrap: [string, string], placeholder: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const before = content.slice(0, selectionStart);
    const selected = content.slice(selectionStart, selectionEnd);
    const after = content.slice(selectionEnd);
    const insertion = selected.length > 0 ? selected : placeholder;
    const [prefix, suffix] = wrap;
    const newContent = before + prefix + insertion + suffix + after;
    setContent(newContent);
    // keep focus
    setTimeout(() => contentInputRef.current?.focus(), 50);
  };

  if (!note) {
    return (
      <View style={[styles.container, { paddingTop: topPad, backgroundColor: Colors.background }]}>
        <Text style={[styles.errorText, { color: Colors.error }]}>Note not found</Text>
      </View>
    );
  }

  const markdownStyles = StyleSheet.create({
    body: { backgroundColor: "transparent" },
    heading1: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: Colors.text, marginTop: 20, marginBottom: 8, lineHeight: 30 },
    heading2: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 19, color: Colors.text, marginTop: 16, marginBottom: 6, lineHeight: 26 },
    heading3: { fontFamily: "DMSans_600SemiBold", fontSize: 17, color: Colors.text, marginTop: 14, marginBottom: 4 },
    paragraph: { fontFamily: "DMSans_400Regular", fontSize: 15, color: Colors.textSecondary, lineHeight: 24, marginBottom: 10 },
    strong: { fontFamily: "DMSans_600SemiBold", color: Colors.text },
    em: { fontStyle: "italic", color: Colors.textSecondary },
    code_inline: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 13, backgroundColor: Colors.surfaceElevated, color: Colors.accentLight, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
    fence: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 13, backgroundColor: Colors.surfaceElevated, color: Colors.accentLight, padding: 12, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: Colors.accent, marginVertical: 8, lineHeight: 20 },
    blockquote: { backgroundColor: Colors.accent + "10", borderLeftWidth: 3, borderLeftColor: Colors.accent, paddingLeft: 12, paddingVertical: 6, marginVertical: 8, borderRadius: 4 },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    list_item: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
    bullet_list_icon: { marginRight: 8, marginTop: 9, width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },
    ordered_list_icon: { fontFamily: "DMSans_600SemiBold", fontSize: 14, color: Colors.accent, marginRight: 8, minWidth: 20 },
    hr: { backgroundColor: Colors.border, height: 1, marginVertical: 14 },
    link: { color: Colors.accent, textDecorationLine: "underline" },
  });

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: Colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            if (!isSaved) {
              updateNote(id!, title, content);
              if (geminiApiKey && content.trim().length > 10) {
                setTimeout(() => runAiAnalysis(id!, content, geminiApiKey).catch(() => { }), 500);
              }
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {folder && (
            <View style={[styles.folderBadge, { backgroundColor: folder.color + "20" }]}>
              <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
              <Text style={[styles.folderBadgeText, { color: folder.color }]}>{folder.name}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {!isSaved && <View style={[styles.savingDot, { backgroundColor: Colors.accent }]} />}
          {/* AI Analyze button */}
          <TouchableOpacity
            style={[styles.aiBtn, { backgroundColor: Colors.accent + '18', borderColor: Colors.accent + '44' }, aiAnalyzing && { opacity: 0.7 }]}
            onPress={handleAnalyzeWithAI}
            disabled={aiAnalyzing}
          >
            {aiAnalyzing
              ? <ActivityIndicator size={14} color={Colors.accent} />
              : <Ionicons name="sparkles" size={14} color={Colors.accent} />}
            <Text style={[styles.aiBtnText, { color: Colors.accent }]}>
              {aiAnalyzing ? (aiStatus?.split(' ')[0] ?? 'AI…') : 'AI'}
            </Text>
          </TouchableOpacity>
          {mode === "edit" ? (
            <TouchableOpacity style={[styles.doneButton, { backgroundColor: Colors.accent }]} onPress={handleDone}>
              <Text style={[styles.doneButtonText, { color: Colors.background }]}>Done</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => { setMode("edit"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
              <Ionicons name="pencil" size={20} color={Colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* AI status banner */}
      {aiStatus && (
        <View style={[styles.aiBanner, { backgroundColor: Colors.accent + '15', borderBottomColor: Colors.accent + '30' }]}>
          <Ionicons name="sparkles" size={12} color={Colors.accent} />
          <Text style={[styles.aiBannerText, { color: Colors.accent }]} numberOfLines={1}>{aiStatus}</Text>
        </View>
      )}

      {/* Mode tabs */}
      {mode !== "topics" && (
        <View style={[styles.modeTabs, { borderBottomColor: Colors.border }]}>
          {(["edit", "preview"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.modeTab, { backgroundColor: Colors.surface, borderColor: Colors.border }, mode === m && { backgroundColor: Colors.accent, borderColor: Colors.accent }]}
              onPress={() => { setMode(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name={m === "edit" ? "create-outline" : "eye-outline"} size={14} color={mode === m ? Colors.background : Colors.textMuted} />
              <Text style={[styles.modeTabText, { color: Colors.textMuted }, mode === m && { color: Colors.background }]}>{m === "edit" ? "Edit" : "Preview"}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Markdown Toolbar — only visible in edit mode */}
      {mode === "edit" && (
        <View style={[styles.mdToolbar, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
          {MARKDOWN_TOOLBAR.map((btn) => (
            <TouchableOpacity
              key={btn.label}
              style={[styles.mdToolbarBtn, { borderColor: Colors.border }]}
              onPress={() => insertMarkdown(btn.wrap as [string, string], btn.placeholder)}
              activeOpacity={0.6}
            >
              <Text style={[styles.mdToolbarBtnText, { color: Colors.accent }]}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.toolbarSpacer} />
          <TouchableOpacity
            style={[styles.mdToolbarBtn, { borderColor: Colors.border }]}
            onPress={() => {
              const pos = selectionEnd;
              const before = content.slice(0, pos);
              const after = content.slice(pos);
              setContent(before + "\n\n\n\n" + after);
            }}
            activeOpacity={0.6}
          >
            <Ionicons name="return-down-forward" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === "web" ? 60 : 60 + insets.bottom }]}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {mode === "edit" ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <TextInput
              style={[styles.titleInput, { color: Colors.text }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Note title..."
              placeholderTextColor={Colors.textMuted}
              multiline={false}
            />
            <View style={styles.editorHintRow}>
              <Ionicons name="logo-markdown" size={14} color={Colors.textMuted} />
              <Text style={[styles.editorHintText, { color: Colors.textMuted }]}>Markdown supported · Separate topics with 3 blank lines</Text>
            </View>
            <TextInput
              ref={contentInputRef}
              style={[styles.contentInput, { color: Colors.text, backgroundColor: Colors.surface, borderColor: Colors.border }]}
              value={content}
              onChangeText={setContent}
              placeholder={"## Topic Title\nYour notes here...\n\nUse **bold**, *italic*, `code`\n\n\n\n## Next Topic\nMore notes..."}
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
              autoFocus={content.length === 0}
              scrollEnabled={false}
              onSelectionChange={(e) => {
                setSelectionStart(e.nativeEvent.selection.start);
                setSelectionEnd(e.nativeEvent.selection.end);
              }}
            />
          </Animated.View>
        ) : mode === "preview" ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Text style={[styles.titleDisplay, { color: Colors.text }]}>{title}</Text>
            {content.length > 0 ? (
              <Markdown style={markdownStyles as any}>{content}</Markdown>
            ) : (
              <Text style={[styles.emptyPreviewText, { color: Colors.textMuted }]}>Nothing to preview yet.</Text>
            )}
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)}>
            <TextInput
              style={[styles.titleDisplay, { color: Colors.text }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Note title..."
              placeholderTextColor={Colors.textMuted}
              editable={false}
            />
            {content.length === 0 ? (
              <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyContent}>
                <Ionicons name="create-outline" size={40} color={Colors.textMuted} />
                <Text style={[styles.emptyContentText, { color: Colors.textSecondary }]}>Tap the pencil to start writing</Text>
                <Text style={[styles.emptyContentHint, { color: Colors.textMuted }]}>Supports Markdown · Separate topics with 3 blank lines</Text>
              </Animated.View>
            ) : (
              <View style={styles.topicsList}>
                <View style={styles.topicsCountRow}>
                  <Ionicons name="list" size={14} color={Colors.textMuted} />
                  <Text style={[styles.topicsCountText, { color: Colors.textMuted }]}>
                    {topics.length} {topics.length === 1 ? "topic" : "topics"} detected
                  </Text>
                </View>
                {topics.map((topic, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.topicPreviewCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({ pathname: "/topic/[folderId]/[noteId]/[topicIndex]", params: { folderId: note.folderId, noteId: note.id, topicIndex: String(i) } });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.topicNumberBadge, { backgroundColor: Colors.accent + "22" }]}>
                      <Text style={[styles.topicNumberText, { color: Colors.accent }]}>{i + 1}</Text>
                    </View>
                    <View style={styles.topicPreviewContent}>
                      <Markdown style={{ body: { margin: 0, padding: 0 }, paragraph: [styles.topicPreviewTitle, { color: Colors.text, margin: 0, padding: 0 }] } as any}>{topic.title}</Markdown>
                      {topic.body.length > 0 && (
                        <Text style={[styles.topicPreviewBody, { color: Colors.textMuted }]} numberOfLines={2}>{topic.body.replace(/[#*_`>]/g, "").trim()}</Text>
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
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8, borderBottomWidth: 1 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  folderBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  folderDot: { width: 6, height: 6, borderRadius: 3 },
  folderBadgeText: { fontFamily: "DMSans_500Medium", fontSize: 12 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 60, justifyContent: "flex-end" },
  savingDot: { width: 6, height: 6, borderRadius: 3 },
  doneButton: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  doneButtonText: { fontFamily: "DMSans_600SemiBold", fontSize: 14 },
  modeTabs: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  modeTab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  modeTabText: { fontFamily: "DMSans_500Medium", fontSize: 13 },
  // Markdown toolbar
  mdToolbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, gap: 6 },
  mdToolbarBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  mdToolbarBtnText: { fontFamily: "DMSans_700Bold", fontSize: 14 },
  toolbarSpacer: { flex: 1 },
  // Editor
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },
  titleInput: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, marginBottom: 14, lineHeight: 34 },
  titleDisplay: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, marginBottom: 14, lineHeight: 34 },
  editorHintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  editorHintText: { fontFamily: "DMSans_400Regular", fontSize: 12 },
  contentInput: { fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 26, minHeight: 400, borderRadius: 12, padding: 16, borderWidth: 1 },
  emptyPreviewText: { fontFamily: "DMSans_400Regular", fontSize: 15, fontStyle: "italic" },
  emptyContent: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyContentText: { fontFamily: "DMSans_500Medium", fontSize: 16, marginTop: 4 },
  emptyContentHint: { fontFamily: "DMSans_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: 32 },
  topicsList: { gap: 8 },
  topicsCountRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  topicsCountText: { fontFamily: "DMSans_500Medium", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  topicPreviewCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, borderWidth: 1, gap: 12 },
  topicNumberBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  topicNumberText: { fontFamily: "DMSans_600SemiBold", fontSize: 12 },
  topicPreviewContent: { flex: 1, gap: 3 },
  topicPreviewTitle: { fontFamily: "DMSans_600SemiBold", fontSize: 15 },
  topicPreviewBody: { fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 18 },
  errorText: { fontFamily: "DMSans_400Regular", fontSize: 16, textAlign: "center", marginTop: 40 },
  // AI button
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  aiBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 13 },
  aiBanner: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1 },
  aiBannerText: { fontFamily: "DMSans_400Regular", fontSize: 12, flex: 1 },
});
