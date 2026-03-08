/**
 * Copyright (c) 2026 Rahul Varanasi. All Rights Reserved.
 * This file is part of RVX AI Notes — a proprietary software.
 * Unauthorized copying, distribution, or use is strictly prohibited.
 * See LICENSE file in the root directory for full terms.
 */
import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Platform,
    ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { useNotes, parseTopics, Folder, Note, getTopicKey } from "@/context/NotesContext";
import { getCachedTopics } from "@/lib/topicCache";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInRight, FadeOutLeft, LinearTransition } from "react-native-reanimated";
import { stripMarkdown } from "@/components/FeedCard";
import FeedCard, { CARD_HEIGHT } from "@/components/FeedCard";
import { router, useNavigation } from "expo-router";
import LivingAiIcon from "@/components/LivingAiIcon";
import type { ParsedTopic } from "@/lib/smartTopicParser";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type ViewState =
    | { type: 'folders' }
    | { type: 'notes'; folderId: string; folderName: string }
    | { type: 'blocks'; noteId: string; folderId: string; noteTitle: string; blocks: any[]; isLoading?: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// KEYWORD CHIPS  — renders up to 3 keyword tags on a block card
// ─────────────────────────────────────────────────────────────────────────────
function KeywordChips({ keywords, accentColor }: { keywords: string[]; accentColor: string }) {
    if (!keywords || keywords.length === 0) return null;
    return (
        <View style={chipStyles.row}>
            {keywords.slice(0, 3).map((kw, i) => (
                <View key={i} style={[chipStyles.chip, { backgroundColor: accentColor + '18' }]}>
                    <Text style={[chipStyles.text, { color: accentColor }]}>{kw}</Text>
                </View>
            ))}
        </View>
    );
}

const chipStyles = StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingHorizontal: 16 },
    chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    text: { fontFamily: 'DMSans_500Medium', fontSize: 11 },
});

// ─────────────────────────────────────────────────────────────────────────────
// BADGE ROW  — hasCode / hasDefinitions / wordCount indicators
// ─────────────────────────────────────────────────────────────────────────────
function BlockBadges({
    hasCode,
    hasDefinitions,
    wordCount,
    borderColor,
    textColor,
}: {
    hasCode?: boolean;
    hasDefinitions?: boolean;
    wordCount?: number;
    borderColor: string;
    textColor: string;
}) {
    const badges = [];
    if (hasCode) badges.push({ label: '{ }  Code', key: 'code' });
    if (hasDefinitions) badges.push({ label: '📖  Defs', key: 'def' });
    if (wordCount) badges.push({ label: `${wordCount}w`, key: 'wc' });

    if (badges.length === 0) return null;

    return (
        <View style={badgeStyles.row}>
            {badges.map(b => (
                <View key={b.key} style={[badgeStyles.badge, { borderColor }]}>
                    <Text style={[badgeStyles.text, { color: textColor }]}>{b.label}</Text>
                </View>
            ))}
        </View>
    );
}

const badgeStyles = StyleSheet.create({
    row: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' },
    badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
    text: { fontFamily: 'DMSans_400Regular', fontSize: 10 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function SummariesScreen() {
    const insets = useSafeAreaInsets();
    const { colors: Colors, theme } = useTheme();
    const { notes, folders, markedTopics, toggleTopicMark } = useNotes();
    const [viewStack, setViewStack] = useState<ViewState[]>([{ type: 'folders' }]);
    const navigation = useNavigation();
    const topPad = Platform.OS === "web" ? 60 : insets.top;
    const SUMMARY_CARD_HEIGHT = CARD_HEIGHT - 80;

    React.useEffect(() => {
        const unsubscribe = (navigation as any).addListener('tabPress', (e: any) => {
            // Reset to folders view when the tab is tapped
            setViewStack([{ type: 'folders' }]);
        });
        return unsubscribe;
    }, [navigation]);

    const currentView = viewStack[viewStack.length - 1];

    const isMidnightGlass = theme === 'midnightGlass';
    const cardStyle = {
        backgroundColor: Colors.card,
        borderColor: isMidnightGlass ? 'transparent' : Colors.border,
        borderWidth: isMidnightGlass ? 0 : 1,
    };

    const handleBack = () => {
        if (viewStack.length > 1) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setViewStack((prev) => prev.slice(0, -1));
        }
    };

    const loadBlocksForNote = async (note: Note) => {
        // Show loading state while we fetch/compute
        setViewStack(prev => [
            ...prev,
            {
                type: 'blocks',
                noteId: note.id,
                folderId: note.folderId,
                noteTitle: note.title,
                blocks: [],
                isLoading: true,
            },
        ]);

        let blocks = await getCachedTopics(note.id, note.content);
        if (!blocks) blocks = parseTopics(note);

        // Update the view with actual data
        setViewStack(prev => {
            const last = prev[prev.length - 1];
            if (last.type !== 'blocks' || last.noteId !== note.id) return prev;
            return [
                ...prev.slice(0, -1),
                { ...last, blocks: blocks ?? [], isLoading: false },
            ];
        });
    };

    const getHeaderInfo = () => {
        if (currentView.type === 'notes') return { title: currentView.folderName, subtitle: 'Notes in this folder' };
        if (currentView.type === 'blocks') return { title: currentView.noteTitle, subtitle: 'Summarised topic blocks' };
        return { title: 'Summaries', subtitle: 'Auto-generated topic blocks from your notes' };
    };

    const { title, subtitle } = getHeaderInfo();

    // ── FOLDERS VIEW ──────────────────────────────────────────────────────────
    const renderFolders = () => (
        <FlatList
            data={folders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item }) => (
                <Animated.View entering={FadeInRight} exiting={FadeOutLeft}>
                    <TouchableOpacity
                        style={[styles.card, cardStyle]}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setViewStack(prev => [...prev, { type: 'notes', folderId: item.id, folderName: item.name }]);
                        }}
                    >
                        <View style={[styles.iconBox, { backgroundColor: item.color + '20' }]}>
                            <Ionicons name="folder" size={24} color={item.color} />
                        </View>
                        <View style={styles.cardContent}>
                            <Text style={[styles.cardTitle, { color: Colors.text }]}>{item.name}</Text>
                            <Text style={[styles.cardSubtitle, { color: Colors.textSecondary }]}>
                                {notes.filter((n) => n.folderId === item.id).length} notes
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.border} />
                    </TouchableOpacity>
                </Animated.View>
            )}
            ListEmptyComponent={
                <View style={styles.emptyContainer}>
                    <LivingAiIcon active={false} size={60} />
                    <Text style={[styles.emptyText, { color: Colors.text, marginTop: 20 }]}>Summary Hub</Text>
                    <Text style={[styles.emptySubText, { color: Colors.textSecondary, textAlign: 'center' }]}>
                        This is where your notes are distilled into
                        smart, bite-sized topic blocks.
                        {"\n\n"}
                        Go to Folders and add your first note to unlock AI summaries.
                    </Text>
                </View>
            }
        />
    );

    // ── NOTES VIEW ────────────────────────────────────────────────────────────
    const renderNotes = () => {
        if (currentView.type !== 'notes') return null;
        const folderNotes = notes.filter((n) => n.folderId === currentView.folderId);
        return (
            <FlatList
                data={folderNotes}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                renderItem={({ item }) => (
                    <Animated.View entering={FadeInRight} exiting={FadeOutLeft}>
                        <TouchableOpacity
                            style={[styles.card, cardStyle]}
                            onPress={async () => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                await loadBlocksForNote(item);
                            }}
                        >
                            <View style={[styles.iconBox, { backgroundColor: Colors.border }]}>
                                <Ionicons name="document-text" size={24} color={Colors.textSecondary} />
                            </View>
                            <View style={styles.cardContent}>
                                <Text style={[styles.cardTitle, { color: Colors.text }]} numberOfLines={1}>{item.title}</Text>
                                <Text style={[styles.cardSubtitle, { color: Colors.textSecondary }]} numberOfLines={1}>
                                    {stripMarkdown(item.content).substring(0, 50)}
                                    {item.content.length > 50 ? '…' : ''}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={Colors.border} />
                        </TouchableOpacity>
                    </Animated.View>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
                        <Text style={[styles.emptyText, { color: Colors.textMuted }]}>No notes in this folder.</Text>
                    </View>
                }
            />
        );
    };

    // ── BLOCKS VIEW ───────────────────────────────────────────────────────────
    const renderBlocks = () => {
        if (currentView.type !== 'blocks') return null;

        if (currentView.isLoading) {
            return (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.accent} />
                    <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>
                        Generating summaries…
                    </Text>
                </View>
            );
        }

        const blocks = currentView.blocks;
        const folder = folders.find(f => f.id === currentView.folderId);
        const folderName = folder?.name || 'Folder';
        const folderColor = folder?.color || Colors.accent;

        const feedItems = blocks.map((item, index) => ({
            id: item.id || `${currentView.noteId}-${index}`,
            title: item.title,
            bodyRaw: item.summary || item.body || '',
            summary: item.summary || '',
            noteId: currentView.noteId,
            noteTitle: currentView.noteTitle,
            folderId: currentView.folderId,
            folderName: folderName,
            folderColor: folderColor,
            topicIndex: index,
        }));

        return (
            <Animated.FlatList
                itemLayoutAnimation={LinearTransition}
                data={feedItems}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, { paddingBottom: 120 }]}
                showsVerticalScrollIndicator={false}
                snapToInterval={SUMMARY_CARD_HEIGHT}
                snapToAlignment="start"
                decelerationRate="fast"
                renderItem={({ item, index }) => (
                    <Animated.View entering={FadeInRight.delay(Math.min(index, 5) * 50)}>
                        <FeedCard
                            item={item as any}
                            index={index}
                            Colors={Colors}
                            theme={theme}
                            isMarked={!!markedTopics[getTopicKey(item.noteId, item.topicIndex)]}
                            onToggleMark={() => toggleTopicMark(item.noteId, item.topicIndex)}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                router.push({
                                    pathname: '/topic/[folderId]/[noteId]/[topicIndex]',
                                    params: {
                                        folderId: currentView.folderId,
                                        noteId: currentView.noteId,
                                        topicIndex: String(item.topicIndex),
                                    },
                                });
                            }}
                            cardHeight={SUMMARY_CARD_HEIGHT}
                            isGlass={true}
                        />
                    </Animated.View>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="sparkles-outline" size={48} color={Colors.textMuted} />
                        <Text style={[styles.emptyText, { color: Colors.textMuted }]}>No summary blocks available.</Text>
                        <Text style={[styles.emptySubText, { color: Colors.textMuted }]}>Add content to this note to generate topic blocks.</Text>
                    </View>
                }
            />
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: Colors.background }]}>
            <Animated.View entering={FadeIn.duration(400)} style={[styles.header, { paddingTop: topPad + 30 }]}>
                <View style={styles.headerRow}>
                    {viewStack.length > 1 ? (
                        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color={Colors.text} />
                        </TouchableOpacity>
                    ) : null}
                    <Text style={[styles.headerTitle, { color: Colors.text }]}>{title}</Text>
                </View>
                <Text style={[styles.headerSubtitle, { color: Colors.textSecondary }]}>{subtitle}</Text>
            </Animated.View>

            {currentView.type === 'folders' && renderFolders()}
            {currentView.type === 'notes' && renderNotes()}
            {currentView.type === 'blocks' && renderBlocks()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    listContent: { paddingTop: 0 },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 6,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerTitle: {
        flex: 1,
        fontFamily: 'DMSans_500Medium',
        fontSize: 22,
        letterSpacing: 4,
        textTransform: 'uppercase',
    },
    headerSubtitle: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 14,
        marginTop: 4,
    },
    listContainer: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    cardContent: { flex: 1 },
    cardTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 16, marginBottom: 2 },
    cardSubtitle: { fontFamily: 'DMSans_400Regular', fontSize: 13 },
    blockCard: {
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    blockHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
    },
    blockNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        flexShrink: 0,
    },
    blockNumberText: {
        color: '#fff',
        fontFamily: 'DMSans_700Bold',
        fontSize: 12,
    },
    blockTitle: {
        flex: 1,
        fontFamily: 'DMSans_600SemiBold',
        fontSize: 15,
        lineHeight: 20,
    },
    blockContent: {
        padding: 16,
        paddingBottom: 4,
        fontFamily: 'DMSans_400Regular',
        fontSize: 14,
        lineHeight: 22,
    },
    blockFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        paddingTop: 10,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderTopWidth: 1,
    },
    blockFooterText: {
        fontFamily: 'DMSans_600SemiBold',
        fontSize: 13,
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 80,
        gap: 10,
        paddingHorizontal: 40,
    },
    emptyText: {
        textAlign: 'center',
        fontFamily: 'DMSans_500Medium',
        fontSize: 16,
    },
    emptySubText: {
        textAlign: 'center',
        fontFamily: 'DMSans_400Regular',
        fontSize: 13,
        lineHeight: 18,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    loadingText: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 14,
    },
});