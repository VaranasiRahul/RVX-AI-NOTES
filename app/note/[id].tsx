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
    Dimensions,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInUp,
    FadeOut,
    ZoomIn,
    ZoomOut,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    withDelay,
    Easing,
    cancelAnimation,
    SlideInRight,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { useNotes, parseTopics, runAiAnalysis } from "@/context/NotesContext";
import { useTheme } from "@/context/ThemeContext";

const MARKDOWN_TOOLBAR = [
    { icon: "format-bold", wrap: ["**", "**"], placeholder: "bold text" },
    { icon: "format-italic", wrap: ["*", "*"], placeholder: "italic text" },
    { icon: "format-strikethrough-variant", wrap: ["~~", "~~"], placeholder: "strikethrough" },
    { icon: "marker", wrap: ["==", "=="], placeholder: "highlight" },
    { icon: "format-header-2", wrap: ["## ", ""], placeholder: "Heading" },
    { icon: "format-list-bulleted", wrap: ["- ", ""], placeholder: "list item" },
    { icon: "format-list-numbered", wrap: ["1. ", ""], placeholder: "list item" },
    { icon: "checkbox-marked-outline", wrap: ["- [ ] ", ""], placeholder: "todo item" },
    { icon: "format-quote-close", wrap: ["> ", ""], placeholder: "quote" },
    { icon: "code-tags", wrap: ["`", "`"], placeholder: "code" },
    { icon: "console", wrap: ["\n```\n", "\n```\n"], placeholder: "code block" },
    { icon: "image-outline", wrap: ["![alt text](", ")"], placeholder: "image url" },
];

// Accent color palette for block card gradient bars (HEX so alpha suffixes work)
const BLOCK_ACCENT_PALETTE = [
    '#7C3AED', // purple
    '#0EA5E9', // blue
    '#14B8A6', // teal
    '#F59E0B', // amber
    '#F43F5E', // rose
    '#22C55E', // emerald
    '#8B5CF6', // violet
    '#F97316', // orange
];

function getBlockAccent(index: number): string {
    return BLOCK_ACCENT_PALETTE[index % BLOCK_ACCENT_PALETTE.length];
}

// ── AI Progress Overlay Component ─────────────────────────────────────────────
function AiProgressOverlay({
    visible,
    status,
    blockCount,
    colors,
}: {
    visible: boolean;
    status: string | null;
    blockCount: number;
    colors: any;
}) {
    const pulseScale = useSharedValue(1);
    const sparkleRotation = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            pulseScale.value = withRepeat(
                withSequence(
                    withTiming(1.15, { duration: 900, easing: Easing.inOut(Easing.ease) }),
                    withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
            sparkleRotation.value = withRepeat(
                withTiming(360, { duration: 3000, easing: Easing.linear }),
                -1,
                false
            );
        } else {
            cancelAnimation(pulseScale);
            cancelAnimation(sparkleRotation);
            pulseScale.value = 1;
            sparkleRotation.value = 0;
        }
    }, [visible]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    const sparkleStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${sparkleRotation.value}deg` }],
    }));

    if (!visible) return null;

    const isDone = status?.startsWith('Done') || false;

    return (
        <Animated.View
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(300)}
            style={[styles.overlayContainer, { backgroundColor: colors.background + 'F5' }]}
        >
            <View style={styles.overlayContent}>
                {/* Animated glow ring */}
                <Animated.View style={[styles.overlayGlowRing, pulseStyle, { borderColor: colors.accent + '30' }]}>
                    <Animated.View style={[styles.overlayGlowInner, { backgroundColor: colors.accent + '10' }]}>
                        <Animated.View style={sparkleStyle}>
                            <Ionicons
                                name={isDone ? "checkmark-circle" : "sparkles"}
                                size={isDone ? 44 : 36}
                                color={isDone ? colors.success : colors.accent}
                            />
                        </Animated.View>
                    </Animated.View>
                </Animated.View>

                {/* Title */}
                <Animated.Text
                    entering={FadeInDown.delay(200)}
                    style={[styles.overlayTitle, { color: colors.text }]}
                >
                    {isDone ? 'Analysis Complete' : 'Analyzing Notes'}
                </Animated.Text>

                {/* Status */}
                {status && (
                    <Animated.Text
                        key={status}
                        entering={FadeInUp.duration(200)}
                        style={[styles.overlayStatus, { color: colors.textSecondary }]}
                    >
                        {status}
                    </Animated.Text>
                )}

                {/* Block count badge on completion */}
                {isDone && blockCount > 0 && (
                    <Animated.View
                        entering={ZoomIn.delay(300).springify()}
                        style={[styles.overlayBlockBadge, { backgroundColor: colors.success + '15', borderColor: colors.success + '30' }]}
                    >
                        <Ionicons name="layers-outline" size={16} color={colors.success} />
                        <Text style={[styles.overlayBlockText, { color: colors.success }]}>
                            {blockCount} {blockCount === 1 ? 'block' : 'blocks'} created
                        </Text>
                    </Animated.View>
                )}
            </View>
        </Animated.View>
    );
}

// ── Rich Block Card Component ─────────────────────────────────────────────────
function BlockCard({
    topic,
    index,
    onPress,
    colors,
    delay,
}: {
    topic: any;
    index: number;
    onPress: () => void;
    colors: any;
    delay: number;
}) {
    const accentColor = getBlockAccent(index);

    // Derive keywords from cache or compute from body
    const keywords: string[] = topic.keywords || [];
    const wc: number = topic.wordCount || topic.body?.split(/\s+/).filter((w: string) => w.length > 0).length || 0;
    const hasCode = topic.hasCode ?? /```[\s\S]*?```/.test(topic.body || '');
    const hasDefs = topic.hasDefinitions ?? false;

    // Get summary preview (2 lines worth)
    const summaryPreview = (topic.summary || '')
        .replace(/[#*_`>]/g, '')
        .replace(/\n/g, ' ')
        .trim()
        .slice(0, 140);

    return (
        <Animated.View entering={FadeInDown.delay(delay).springify().damping(18)}>
            <TouchableOpacity
                style={[styles.richCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={onPress}
                activeOpacity={0.85}
            >
                {/* Card body */}
                <View style={styles.richCardBody}>
                    {/* Header row */}
                    <View style={styles.richCardHeader}>
                        <View style={[styles.richCardIndex, { backgroundColor: accentColor + '20' }]}>
                            <Text style={[styles.richCardIndexText, { color: accentColor }]}>{index + 1}</Text>
                        </View>
                        <View style={styles.richCardTitleWrap}>
                            <Markdown
                                style={{
                                    body: { margin: 0, padding: 0 },
                                    paragraph: {
                                        ...styles.richCardTitle,
                                        color: colors.text,
                                        margin: 0,
                                        padding: 0,
                                    },
                                } as any}
                            >
                                {topic.title}
                            </Markdown>
                        </View>
                        <View style={styles.richCardArrow}>
                            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </View>
                    </View>

                    {/* Summary preview */}
                    {summaryPreview.length > 0 && (
                        <Text
                            style={[styles.richCardSummary, { color: colors.textSecondary }]}
                            numberOfLines={2}
                        >
                            {summaryPreview}
                        </Text>
                    )}

                    {/* Keywords row */}
                    {keywords.length > 0 && (
                        <View style={styles.richCardKeywords}>
                            {keywords.slice(0, 4).map((kw, ki) => (
                                <View
                                    key={ki}
                                    style={[styles.keywordPill, { backgroundColor: accentColor + '18', borderColor: accentColor + '40' }]}
                                >
                                    <Text style={[styles.keywordText, { color: accentColor }]}>
                                        {kw}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Metadata row */}
                    <View style={styles.richCardMeta}>
                        <View style={styles.richCardMetaItem}>
                            <Ionicons name="document-text-outline" size={11} color={colors.textMuted} />
                            <Text style={[styles.richCardMetaText, { color: colors.textMuted }]}>
                                {wc} words
                            </Text>
                        </View>
                        {hasCode && (
                            <View style={[styles.richCardBadge, { backgroundColor: colors.accent + '15' }]}>
                                <Ionicons name="code-slash" size={10} color={colors.accent} />
                                <Text style={[styles.richCardBadgeText, { color: colors.accent }]}>Code</Text>
                            </View>
                        )}
                        {hasDefs && (
                            <View style={[styles.richCardBadge, { backgroundColor: colors.success + '15' }]}>
                                <Ionicons name="book-outline" size={10} color={colors.success} />
                                <Text style={[styles.richCardBadgeText, { color: colors.success }]}>Definitions</Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

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
    const [cachedTopics, setCachedTopics] = useState<{ title: string; body: string; summary?: string; keywords?: string[]; wordCount?: number; hasCode?: boolean; hasDefinitions?: boolean }[] | null>(null);
    const [aiStatus, setAiStatus] = useState<string | null>(null);
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [showOverlay, setShowOverlay] = useState(false);
    const [overlayBlockCount, setOverlayBlockCount] = useState(0);
    const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const contentInputRef = useRef<TextInput>(null);
    const aiLockRef = useRef(false);
    const [showTopicGuide, setShowTopicGuide] = useState(false);

    // Floating AI button — gentle shimmer only
    const fabShimmer = useSharedValue(0);

    useEffect(() => {
        if (mode === 'topics' && content.length > 0 && !aiAnalyzing) {
            fabShimmer.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
        } else {
            cancelAnimation(fabShimmer);
            fabShimmer.value = 0;
        }
    }, [mode, aiAnalyzing, content.length]);

    const fabShimmerStyle = useAnimatedStyle(() => ({
        opacity: 0.7 + fabShimmer.value * 0.3,
    }));

    // Show guide for new notes
    useEffect(() => {
        if (note && note.content.length === 0) {
            setTimeout(() => setShowTopicGuide(true), 600);
        }
    }, [id]);

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
    }, [content, title, id, updateNote]);

    const handleDone = () => {
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        updateNote(id!, title, content);
        setIsSaved(true);
        setMode("topics");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        import('@/lib/topicCache').then(({ clearCachedTopics }) => {
            clearCachedTopics(id!); // Clear any AI cache so manual edits take priority
        });
    };

    const handleAnalyzeWithAI = async () => {
        if (!id || !content || aiLockRef.current) return;
        aiLockRef.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        // Save first so analysis uses latest content
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        await updateNote(id, title, content);
        setAiAnalyzing(true);
        setShowOverlay(true);
        setAiStatus('Preparing analysis…');
        setOverlayBlockCount(0);

        try {
            const generated = await analyzeNoteWithAI(id, content, (msg) => setAiStatus(msg));
            setCachedTopics(generated);
            setOverlayBlockCount(generated.length);
            setAiStatus('Done ✓');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Auto-dismiss overlay after a moment
            setTimeout(() => {
                setShowOverlay(false);
                setMode('topics');
            }, 1800);
        } catch (e: any) {
            setAiStatus('Error: ' + (e?.message ?? 'failed'));
            setTimeout(() => setShowOverlay(false), 3000);
        } finally {
            aiLockRef.current = false;
            setAiAnalyzing(false);
            setTimeout(() => setAiStatus(null), 5000);
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
        s: { textDecorationLine: "line-through", color: Colors.textMuted },
    });

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: Colors.background }]}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
            {/* Header */}
            <View style={[styles.header, { paddingTop: topPad + 16, borderBottomColor: Colors.border }]}>
                <TouchableOpacity
                    onPress={() => {
                        if (!isSaved) {
                            updateNote(id!, title, content);
                        }
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (router.canGoBack()) {
                            router.back();
                        } else {
                            router.replace("/(tabs)");
                        }
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

            {/* Premium Floating Mode Tabs */}
            <View style={styles.floatingTabsContainer}>
                <View style={[styles.glassTabs, { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)' }]}>
                    {(["topics", "edit", "preview"] as const).map((m) => (
                        <TouchableOpacity
                            key={m}
                            style={[styles.glassTab, mode === m && { backgroundColor: Colors.accent }]}
                            onPress={() => { setMode(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                        >
                            <Ionicons
                                name={m === "topics" ? "list" : m === "edit" ? "create" : "eye"}
                                size={14}
                                color={mode === m ? Colors.background : Colors.textMuted}
                            />
                            <Text style={[styles.glassTabText, { color: mode === m ? Colors.background : Colors.textMuted }]}>
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Premium Floating Markdown Toolbar */}
            {mode === "edit" && (
                <View style={styles.floatingToolbarContainer}>
                    <View style={[styles.glassToolbar, { backgroundColor: 'rgba(255, 255, 255, 0.08)', borderColor: 'rgba(255, 255, 255, 0.12)' }]}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScroll}>
                            {MARKDOWN_TOOLBAR.map((btn, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[styles.glassToolbarBtn, { backgroundColor: Colors.card }]}
                                    onPress={() => insertMarkdown(btn.wrap as [string, string], btn.placeholder)}
                                >
                                    <MaterialCommunityIcons name={btn.icon as any} size={20} color={Colors.accent} />
                                </TouchableOpacity>
                            ))}
                            <View style={styles.toolbarDivider} />
                            <TouchableOpacity
                                style={[styles.glassToolbarBtn, { backgroundColor: Colors.card }]}
                                onPress={() => {
                                    const pos = selectionEnd;
                                    const before = content.slice(0, pos);
                                    const after = content.slice(pos);
                                    setContent(before + "\n\n\n\n" + after);
                                }}
                            >
                                <Ionicons name="return-down-forward" size={16} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            )}

            <KeyboardAwareScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === "web" ? 60 : 150 + insets.bottom }]}
                keyboardDismissMode="none"
                showsVerticalScrollIndicator={false}
                bottomOffset={80}
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
                        {showTopicGuide && (
                            <Animated.View entering={FadeInDown} style={[styles.guideCard, { backgroundColor: Colors.accent + '15', borderColor: Colors.accent + '30' }]}>
                                <View style={styles.guideHeader}>
                                    <Ionicons name="bulb-outline" size={18} color={Colors.accent} />
                                    <Text style={[styles.guideTitle, { color: Colors.accent }]}>Topic Separation Tips</Text>
                                    <TouchableOpacity onPress={() => setShowTopicGuide(false)}>
                                        <Ionicons name="close" size={18} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.guideContent}>
                                    <Text style={[styles.guideText, { color: Colors.text }]}>
                                        <Text style={{ fontFamily: 'DMSans_700Bold' }}>Manual:</Text> Use 3 blank lines between topics and tap <Text style={{ fontFamily: 'DMSans_700Bold' }}>Done</Text> to split them into blocks.
                                    </Text>
                                    <Text style={[styles.guideText, { color: Colors.text, marginTop: 8 }]}>
                                        <Text style={{ fontFamily: 'DMSans_700Bold' }}>AI Power:</Text> Enter your <Text style={{ color: Colors.accent }} onPress={() => { setShowTopicGuide(false); router.push('/settings'); }}>Gemini API key</Text> in settings for automatic chapters and summaries!
                                    </Text>
                                </View>
                            </Animated.View>
                        )}

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
                            selectionColor={Colors.accent}
                            dataDetectorTypes="none"
                            autoCorrect={false}
                            autoCapitalize="sentences"
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
                                {/* Block count header */}
                                <View style={styles.topicsCountRow}>
                                    <View style={[styles.topicsCountBadge, { backgroundColor: Colors.accent + '12' }]}>
                                        <Ionicons name="layers-outline" size={14} color={Colors.accent} />
                                        <Text style={[styles.topicsCountText, { color: Colors.accent }]}>
                                            {topics.length} {topics.length === 1 ? "Block" : "Blocks"}
                                        </Text>
                                    </View>
                                    {cachedTopics && (
                                        <View style={[styles.aiAnalyzedBadge, { backgroundColor: Colors.success + '12' }]}>
                                            <Ionicons name="sparkles" size={12} color={Colors.success} />
                                            <Text style={[styles.aiAnalyzedText, { color: Colors.success }]}>AI Analyzed</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Rich block cards */}
                                {topics.map((topic, i) => (
                                    <BlockCard
                                        key={i}
                                        topic={topic}
                                        index={i}
                                        colors={Colors}
                                        delay={80 + i * 60}
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            router.push({ pathname: "/topic/[folderId]/[noteId]/[topicIndex]", params: { folderId: note.folderId, noteId: note.id, topicIndex: String(i) } });
                                        }}
                                    />
                                ))}
                            </View>
                        )}
                    </Animated.View>
                )}
            </KeyboardAwareScrollView>

            {/* ── Floating AI Action Button ─────────────────────────────────── */}
            {mode === "topics" && content.length > 0 && !showOverlay && (
                <Animated.View
                    entering={FadeInDown.delay(300).springify()}
                    style={[styles.fabContainer, { bottom: Platform.OS === "web" ? 30 : insets.bottom + 20 }]}
                >
                    <TouchableOpacity
                        style={[styles.fab, { backgroundColor: Colors.accent }]}
                        onPress={handleAnalyzeWithAI}
                        disabled={aiAnalyzing}
                        activeOpacity={0.8}
                    >
                        {aiAnalyzing ? (
                            <ActivityIndicator size={20} color={Colors.background} />
                        ) : (
                            <>
                                <Animated.View style={fabShimmerStyle}>
                                    <Ionicons name="sparkles" size={18} color={Colors.background} />
                                </Animated.View>
                                <Text style={[styles.fabText, { color: Colors.background }]}>AI Split</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* ── AI Progress Overlay ─────────────────────────────────────── */}
            <AiProgressOverlay
                visible={showOverlay}
                status={aiStatus}
                blockCount={overlayBlockCount}
                colors={Colors}
            />
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
    // Floating elements
    floatingTabsContainer: { paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
    glassTabs: {
        flexDirection: 'row',
        borderRadius: 24,
        padding: 6,
        borderWidth: 1,
        overflow: 'hidden',
    },
    glassTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 18,
    },
    glassTabText: { fontFamily: "DMSans_600SemiBold", fontSize: 13 },

    floatingToolbarContainer: { paddingHorizontal: 16, marginBottom: 8 },
    glassToolbar: {
        borderRadius: 20,
        padding: 8,
        borderWidth: 1,
        overflow: 'hidden',
    },
    toolbarScroll: { gap: 8, alignItems: 'center' },
    glassToolbarBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    glassToolbarBtnText: { fontFamily: "DMSans_700Bold", fontSize: 15 },
    toolbarDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 4 },

    // Editor
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
    titleInput: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 28, marginBottom: 16, lineHeight: 36 },
    titleDisplay: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 28, marginBottom: 16, lineHeight: 36 },
    editorHintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16, opacity: 0.6 },
    editorHintText: { fontFamily: "DMSans_400Regular", fontSize: 12 },
    contentInput: {
        fontFamily: "DMSans_400Regular",
        fontSize: 16,
        lineHeight: 28,
        minHeight: 400,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
    },

    // Topics Block List
    topicsList: { gap: 12 },
    topicsCountRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, paddingLeft: 4 },
    topicsCountBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
    },
    topicsCountText: { fontFamily: "DMSans_600SemiBold", fontSize: 12, letterSpacing: 0.5 },
    aiAnalyzedBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
    },
    aiAnalyzedText: { fontFamily: "DMSans_500Medium", fontSize: 11 },

    // ── Rich Block Card ──────────────────────────────────────────────────────
    richCard: {
        flexDirection: "row",
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 2,
    },
    richCardBody: {
        flex: 1,
        padding: 16,
        gap: 8,
    },
    richCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    richCardIndex: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    richCardIndexText: { fontFamily: "DMSans_700Bold", fontSize: 13 },
    richCardTitleWrap: { flex: 1 },
    richCardTitle: { fontFamily: "DMSans_600SemiBold", fontSize: 15, letterSpacing: -0.2 },
    richCardArrow: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    richCardSummary: {
        fontFamily: "DMSans_400Regular",
        fontSize: 13,
        lineHeight: 19,
        opacity: 0.75,
        paddingLeft: 42,
    },
    richCardKeywords: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        paddingLeft: 42,
    },
    keywordPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
    },
    keywordText: {
        fontFamily: "DMSans_500Medium",
        fontSize: 10,
        letterSpacing: 0.3,
    },
    richCardMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: 42,
    },
    richCardMetaItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
    },
    richCardMetaText: {
        fontFamily: "DMSans_400Regular",
        fontSize: 11,
    },
    richCardBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    richCardBadgeText: {
        fontFamily: "DMSans_500Medium",
        fontSize: 10,
    },

    emptyPreviewText: { fontFamily: "DMSans_400Regular", fontSize: 15, fontStyle: "italic" },
    emptyContent: { alignItems: "center", paddingTop: 60, gap: 10 },
    emptyContentText: { fontFamily: "DMSans_500Medium", fontSize: 16, marginTop: 4 },
    emptyContentHint: { fontFamily: "DMSans_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: 32 },
    errorText: { fontFamily: "DMSans_400Regular", fontSize: 16, textAlign: "center", marginTop: 40 },
    // Guide Card
    guideCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 20 },
    guideHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    guideTitle: { fontFamily: "DMSans_700Bold", fontSize: 14, flex: 1 },
    guideContent: { gap: 4 },
    guideText: { fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 20 },

    // ── Floating AI Action Button ─────────────────────────────────────────────
    fabContainer: {
        position: 'absolute',
        right: 20,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        flexDirection: 'row',
    },
    fab: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    fabText: {
        fontFamily: "DMSans_700Bold",
        fontSize: 15,
        letterSpacing: 0.3,
    },

    // ── AI Progress Overlay ──────────────────────────────────────────────────
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlayContent: {
        alignItems: 'center',
        gap: 20,
        paddingHorizontal: 40,
    },
    overlayGlowRing: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlayGlowInner: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlayTitle: {
        fontFamily: "PlayfairDisplay_700Bold",
        fontSize: 24,
        letterSpacing: -0.3,
    },
    overlayStatus: {
        fontFamily: "DMSans_400Regular",
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    overlayBlockBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
    },
    overlayBlockText: {
        fontFamily: "DMSans_600SemiBold",
        fontSize: 14,
    },
});
