import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { useNotes, parseTopics, Folder, Note } from "@/context/NotesContext";
import { getCachedTopics } from "@/lib/topicCache";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { stripMarkdown } from "@/components/FeedCard";
import { router } from "expo-router";

type ViewState =
    | { type: 'folders' }
    | { type: 'notes'; folderId: string; folderName: string }
    | { type: 'blocks'; noteId: string; folderId: string; noteTitle: string; blocks: any[] };

export default function SummariesScreen() {
    const insets = useSafeAreaInsets();
    const { colors: Colors } = useTheme();
    const { notes, folders } = useNotes();
    const [viewStack, setViewStack] = useState<ViewState[]>([{ type: 'folders' }]);
    const topPad = Platform.OS === "web" ? 60 : insets.top;

    const currentView = viewStack[viewStack.length - 1];

    const handleBack = () => {
        if (viewStack.length > 1) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setViewStack((prev) => prev.slice(0, -1));
        }
    };

    const loadBlocksForNote = async (note: Note) => {
        let t = await getCachedTopics(note.id, note.content);
        if (!t) t = parseTopics(note);
        return t;
    };

    const getHeaderInfo = () => {
        if (currentView.type === 'notes') return { title: currentView.folderName, subtitle: "Notes in this folder" };
        if (currentView.type === 'blocks') return { title: currentView.noteTitle, subtitle: "Summarized blocks" };
        return { title: "Summaries", subtitle: "View auto-generated blocks from your notes" };
    };

    const { title, subtitle } = getHeaderInfo();

    const renderFolders = () => (
        <FlatList
            data={folders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContainer]}
            renderItem={({ item }) => (
                <Animated.View entering={FadeInRight} exiting={FadeOutLeft}>
                    <TouchableOpacity
                        style={[styles.card, { backgroundColor: Colors.card, borderColor: Colors.border }]}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setViewStack((prev) => [...prev, { type: 'notes', folderId: item.id, folderName: item.name }]);
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
                <Text style={[styles.emptyText, { color: Colors.textMuted }]}>No folders yet.</Text>
            }
        />
    );

    const renderNotes = () => {
        if (currentView.type !== 'notes') return null;
        const folderNotes = notes.filter((n) => n.folderId === currentView.folderId);
        return (
            <FlatList
                data={folderNotes}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContainer]}
                renderItem={({ item }) => (
                    <Animated.View entering={FadeInRight} exiting={FadeOutLeft}>
                        <TouchableOpacity
                            style={[styles.card, { backgroundColor: Colors.card, borderColor: Colors.border }]}
                            onPress={async () => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                const blocks = await loadBlocksForNote(item);
                                setViewStack((prev) => [...prev, { type: 'blocks', noteId: item.id, folderId: item.folderId, noteTitle: item.title, blocks }]);
                            }}
                        >
                            <View style={[styles.iconBox, { backgroundColor: Colors.border }]}>
                                <Ionicons name="document-text" size={24} color={Colors.textSecondary} />
                            </View>
                            <View style={styles.cardContent}>
                                <Text style={[styles.cardTitle, { color: Colors.text }]} numberOfLines={1}>{item.title}</Text>
                                <Text style={[styles.cardSubtitle, { color: Colors.textSecondary }]} numberOfLines={1}>
                                    {stripMarkdown(item.content).substring(0, 50)}...
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={Colors.border} />
                        </TouchableOpacity>
                    </Animated.View>
                )}
                ListEmptyComponent={
                    <Text style={[styles.emptyText, { color: Colors.textMuted }]}>No notes in this folder.</Text>
                }
            />
        );
    };

    const renderBlocks = () => {
        if (currentView.type !== 'blocks') return null;
        const blocks = currentView.blocks;
        return (
            <FlatList
                data={blocks}
                keyExtractor={(item, idx) => item.id || String(idx)}
                contentContainerStyle={[styles.listContainer]}
                renderItem={({ item, index }) => (
                    <Animated.View entering={FadeInRight.delay(index * 50)}>
                        <TouchableOpacity
                            style={[styles.blockCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}
                            activeOpacity={0.85}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                router.push({
                                    pathname: '/topic/[folderId]/[noteId]/[topicIndex]',
                                    params: {
                                        folderId: currentView.folderId,
                                        noteId: currentView.noteId,
                                        topicIndex: String(index),
                                    },
                                });
                            }}
                        >
                            <View style={[styles.blockHeader, { borderBottomColor: Colors.border }]}>
                                <View style={[styles.blockNumber, { backgroundColor: Colors.accent }]}>
                                    <Text style={styles.blockNumberText}>{index + 1}</Text>
                                </View>
                                <Text style={[styles.blockTitle, { color: Colors.text }]}>{item.title}</Text>
                            </View>
                            <Text style={[styles.blockContent, { color: Colors.textSecondary }]}>
                                {stripMarkdown(item.summary || '')}
                            </Text>
                            <View style={[styles.blockFooter, { borderTopColor: Colors.border }]}>
                                <Text style={[styles.blockFooterText, { color: Colors.accent }]}>Open original block</Text>
                                <Ionicons name="arrow-forward" size={14} color={Colors.accent} />
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                )}
                ListEmptyComponent={
                    <Text style={[styles.emptyText, { color: Colors.textMuted }]}>No summary blocks available.</Text>
                }
            />
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: Colors.background }]}>
            {/* Plain header — no BlurView */}
            <Animated.View entering={FadeIn.duration(400)} style={[styles.header, { paddingTop: topPad + 16 }]}>
                <View style={styles.headerRow}>
                    {viewStack.length > 1 ? (
                        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color={Colors.text} />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.backButtonPlaceholder} />
                    )}
                    <Text style={[styles.headerTitle, { color: Colors.text }]} numberOfLines={1}>{title}</Text>
                    <View style={styles.headerRightPlaceholder} />
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
    header: {
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    backButtonPlaceholder: { width: 40 },
    headerRightPlaceholder: { width: 40 },
    headerTitle: {
        flex: 1,
        fontFamily: "PlayfairDisplay_700Bold",
        fontSize: 24,
        textAlign: 'center',
    },
    headerSubtitle: {
        fontFamily: "DMSans_400Regular",
        fontSize: 14,
        textAlign: 'center',
    },
    listContainer: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    cardContent: { flex: 1 },
    cardTitle: { fontFamily: "DMSans_600SemiBold", fontSize: 16, marginBottom: 4 },
    cardSubtitle: { fontFamily: "DMSans_400Regular", fontSize: 13 },
    blockCard: { borderRadius: 16, marginBottom: 16, borderWidth: 1, overflow: 'hidden' },
    blockHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1 },
    blockNumber: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    blockNumberText: { color: '#fff', fontFamily: "DMSans_700Bold", fontSize: 12 },
    blockTitle: { flex: 1, fontFamily: "DMSans_600SemiBold", fontSize: 15 },
    blockContent: { padding: 16, fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 22 },
    emptyText: { textAlign: 'center', marginTop: 60, fontFamily: "DMSans_400Regular", fontSize: 16 },
    blockFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12, borderTopWidth: 1 },
    blockFooterText: { fontFamily: "DMSans_600SemiBold", fontSize: 13 },
});