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
    Dimensions,
    Platform,
    FlatList,
    ScrollView // added to support scrolling text content if it overflows
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import Markdown from "react-native-markdown-display";
import { useNotes, getTopicKey } from "@/context/NotesContext";
import { useTheme } from "@/context/ThemeContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// This height calculation matches the vertical snap interval of the Home Feed
const HEADER_HEIGHT = Platform.OS === "web" ? 67 : 62; // updated to match actual navbar height closer
const TAB_BAR_HEIGHT = Platform.OS === "android" ? 110 : 120; // 56 (tab bar) + bottom padding (approx 54)
export const CARD_HEIGHT = SCREEN_HEIGHT - HEADER_HEIGHT - TAB_BAR_HEIGHT;

export interface FeedItem {
    id: string;
    title: string;
    bodyRaw: string;
    summary: string;
    noteId: string;
    noteTitle: string;
    folderId: string;
    folderName: string;
    folderColor: string;
    topicIndex: number;
    isDue?: boolean;
    lastRating?: string | null;
    isDailyPick?: boolean;
}

export function stripMarkdown(text: string): string {
    return text
        .replace(/#{1,6}\s+/g, "")
        .replace(/(\*\*|__)(.*?)\1/g, "$2")
        .replace(/(\*|_)(.*?)\1/g, "$2")
        .replace(/\[(.*?)\]\(.*?\)/g, "$1")
        .replace(/`{1,3}([^`]*?)`{1,3}/g, "$1") // Better logic for code blocks
        .replace(/!\[.*?\]\(.*?\)/g, "") // remove images entirely
        .replace(/>\s*/g, "") // blockquotes
        .replace(/[-*+]\s+/g, "") // Lists
        .replace(/\d+\.\s+/g, "") // numbered lists
        .replace(/---/g, "") // Horizontal Rules
        .replace(/\n{2,}/g, "\n")
        .trim();
}

const FeedCard = React.memo(function FeedCard({
    item,
    index,
    onPress,
    Colors,
    isMarked,
    onToggleMark,
    theme,
    cardHeight = CARD_HEIGHT,
    isGlass = false,
}: {
    item: FeedItem;
    index: number;
    onPress: () => void;
    Colors: any;
    isMarked: boolean;
    onToggleMark: () => void;
    theme: string;
    cardHeight?: number | 'auto';
    isGlass?: boolean;
}) {
    const rawText = item.bodyRaw.trim();

    // Adjust chunkSize based on available vertical space.
    // At fontSize 17, lineHeight 26, a 500-character chunk is a safe limit for a partial-height card to allow for footer/dots.
    const chunks: string[] = [];
    const chunkSize = typeof cardHeight === 'number' && cardHeight < CARD_HEIGHT ? 520 : 800;
    
    // Fallback if we need to split down the text, avoiding to break markdown codeblocks. 
    // Usually it's better to preserve blocks exactly but for display text we attempt naive split:
    if (rawText.length <= chunkSize) {
        chunks.push(rawText);
    } else {
        let currentIdx = 0;
        while (currentIdx < rawText.length) {
            // Find a space near the chunk boundary to keep words intact
            let nextIdx = currentIdx + chunkSize;
            if (nextIdx < rawText.length) {
                const spaceIdx = rawText.lastIndexOf(" ", nextIdx);
                // Only backtrack if the space is not too far back (within 80 chars)
                if (spaceIdx > currentIdx + (chunkSize - 100)) {
                    nextIdx = spaceIdx;
                }
            }
            chunks.push(rawText.slice(currentIdx, nextIdx).trim());
            currentIdx = nextIdx + 1;
        }
    }

    const [activeIndex, setActiveIndex] = useState(0);

    const markdownStyles = StyleSheet.create({
        body: { fontFamily: "DMSans_400Regular", fontSize: 17, color: isGlass ? "#FFFFFF" : Colors.textSecondary, lineHeight: 26, backgroundColor: "transparent" },
        heading1: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: isGlass ? "#FFFFFF" : Colors.text, marginTop: 16, marginBottom: 8, lineHeight: 28 },
        heading2: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: isGlass ? "#FFFFFF" : Colors.text, marginTop: 14, marginBottom: 6, lineHeight: 26 },
        heading3: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 16, color: isGlass ? "#FFFFFF" : Colors.text, marginTop: 12, marginBottom: 4, lineHeight: 24 },
        heading4: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: isGlass ? "#FFFFFF" : Colors.text, marginTop: 10, marginBottom: 2 },
        paragraph: { fontFamily: "DMSans_400Regular", fontSize: 17, color: isGlass ? "#FFFFFF" : Colors.textSecondary, lineHeight: 26, marginBottom: 8 },
        strong: { fontFamily: "DMSans_600SemiBold", color: isGlass ? "#FFFFFF" : Colors.text },
        em: { fontStyle: "italic", color: isGlass ? "#FFFFFF" : Colors.textSecondary },
        s: { textDecorationLine: "line-through", color: Colors.textMuted },
        code_inline: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 14, backgroundColor: Colors.surfaceElevated, color: Colors.accentLight, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
        fence: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 13, backgroundColor: Colors.surfaceElevated, color: Colors.accentLight, padding: 12, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: Colors.accent, marginVertical: 8, lineHeight: 18 },
        blockquote: { backgroundColor: Colors.accent + "10", borderLeftWidth: 3, borderLeftColor: Colors.accent, paddingLeft: 12, paddingVertical: 6, marginVertical: 8, borderRadius: 4 },
        bullet_list: { marginBottom: 8 },
        ordered_list: { marginBottom: 8 },
        list_item: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
        bullet_list_icon: { marginRight: 8, marginTop: 8, width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.accent },
        ordered_list_icon: { fontFamily: "DMSans_600SemiBold", fontSize: 14, color: Colors.accent, marginRight: 8, minWidth: 16 },
        hr: { backgroundColor: Colors.border, height: 1, marginVertical: 12 },
        link: { color: Colors.accent, textDecorationLine: "underline" },
        table: { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, marginVertical: 8, overflow: "hidden" },
        thead: { backgroundColor: Colors.surfaceElevated },
        th: { fontFamily: "DMSans_600SemiBold", fontSize: 13, color: isGlass ? "#FFFFFF" : Colors.text, padding: 8, borderRightWidth: 1, borderRightColor: Colors.border },
        tr: { borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: "row" },
        td: { fontFamily: "DMSans_400Regular", fontSize: 13, color: isGlass ? "#FFFFFF" : Colors.textSecondary, padding: 8, borderRightWidth: 1, borderRightColor: Colors.border, flex: 1 },
    });

    const cardStyle = [
        styles.card,
        {
            backgroundColor: isGlass ? 'transparent' : Colors.card,
            borderColor: isGlass
                ? 'transparent'
                : item.isDailyPick
                    ? 'transparent' // Border handled by gradient wrapper below
                    : (theme === 'midnightGlass' ? 'rgba(255,255,255,0.05)' : (item.isDue ? Colors.accent + "44" : Colors.border)),
            borderWidth: isGlass ? 0 : (item.isDailyPick ? 0 : (theme === 'midnightGlass' ? 1 : 1.5)),
            shadowColor: "#000",
            shadowOpacity: isGlass ? 0.2 : (item.isDailyPick ? 0.3 : 0.4),
            shadowRadius: isGlass ? 8 : 12,
        },
    ];

    const renderContent = () => (
        <>
            <TouchableOpacity
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPress();
                }}
                activeOpacity={0.7}
            >
                <View style={styles.cardTop}>
                    <View
                        style={[
                            styles.folderTag,
                            { backgroundColor: item.folderColor + "20" },
                        ]}
                    >
                        <View
                            style={[styles.folderDot, { backgroundColor: item.folderColor }]}
                        />
                        <Text
                            style={[styles.folderTagText, { color: item.folderColor }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {item.folderName}
                        </Text>
                    </View>
                    {item.isDailyPick && (
                        <View style={[styles.pickBadge, { backgroundColor: Colors.streak + "22", borderColor: Colors.streak + "44" }]}>
                            <Ionicons name="sparkles" size={10} color={Colors.streak} />
                            <Text style={[styles.pickBadgeText, { color: Colors.streak }]}>TODAY&apos;S PICK</Text>
                        </View>
                    )}
                    <View style={styles.cardActionsContainer}>
                        <TouchableOpacity
                            onPress={(e) => {
                                e.stopPropagation();
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                onToggleMark();
                            }}
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                backgroundColor: isMarked ? Colors.accent + "20" : Colors.border,
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Ionicons
                                name={isMarked ? "bookmark" : "bookmark-outline"}
                                size={18}
                                color={isMarked ? Colors.accent : Colors.textMuted}
                            />
                        </TouchableOpacity>
                    </View>
                </View>

                <Animated.View
                    key={`${item.id}-title`}
                    entering={FadeIn.duration(400)}
                    layout={LinearTransition}
                >
                    <View style={styles.titleRow}>
                        {item.lastRating === 'hard' && <View style={[styles.priorityDot, { backgroundColor: Colors.error }]} />}
                        {item.lastRating === 'easy' && <View style={[styles.priorityDot, { backgroundColor: Colors.success }]} />}
                        <Markdown style={{
                            body: { padding: 0, margin: 0 },
                            paragraph: [styles.cardTitle, { color: isGlass ? "#FFFFFF" : Colors.text, flex: 1, padding: 0, margin: 0 }]
                        } as any}>{item.title}</Markdown>
                    </View>
                </Animated.View>
            </TouchableOpacity>

            {/* Horizontal Carousel for Notes */}
            <Animated.View
                key={`${item.id}-carousel`}
                entering={FadeIn.duration(500)}
                style={styles.carouselContainer}
            >
                <FlatList
                    data={chunks}
                    keyExtractor={(_, i) => `chunk-${i}`}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    onMomentumScrollEnd={(e) => {
                        const slide = Math.round(
                            e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width
                        );
                        setActiveIndex(slide);
                    }}
                    renderItem={({ item: chunkText }) => (
                        <View style={styles.carouselSlide}>
                            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                <Markdown style={markdownStyles as any}>
                                    {chunkText}
                                </Markdown>
                            </ScrollView>
                        </View>
                    )}
                />

                {/* Pagination Dots (Instagram style) */}
                {chunks.length > 1 && (
                    <View style={styles.paginationDots}>
                        {chunks.map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.dot,
                                    {
                                        backgroundColor:
                                            i === activeIndex ? Colors.accent : Colors.border,
                                        transform: [{ scale: i === activeIndex ? 1.2 : 1 }],
                                    },
                                ]}
                            />
                        ))}
                    </View>
                )}
            </Animated.View>

            <TouchableOpacity
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPress();
                }}
                activeOpacity={0.7}
            >
                <View
                    style={[
                        styles.cardBottom,
                        { borderTopColor: theme === 'midnightGlass' ? 'transparent' : Colors.border, borderTopWidth: theme === 'midnightGlass' ? 0 : 1 },
                    ]}
                >
                    <View style={styles.cardBottomLeft}>
                        <Ionicons
                            name="document-text-outline"
                            size={12}
                            color={Colors.textMuted}
                        />
                        <Text
                            style={[styles.noteNameText, { color: Colors.textMuted }]}
                            numberOfLines={1}
                        >
                            {item.noteTitle}
                        </Text>
                    </View>
                    <View style={styles.readMoreBtn}>
                        <Text style={[styles.readMoreText, { color: Colors.accent }]}>
                            Open Topic
                        </Text>
                        <Ionicons name="arrow-forward" size={14} color={Colors.accent} />
                    </View>
                </View>
            </TouchableOpacity>
        </>
    );

    return (
        <View style={[styles.cardContainer, { height: cardHeight }]}>
            {item.isDailyPick ? (
                <LinearGradient
                    colors={[Colors.streak, '#FF8A65', Colors.streak]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.card, { padding: 0.8, backgroundColor: 'transparent' }]}
                >
                    <View style={[cardStyle, { flex: 1, margin: 0, borderWidth: 0, overflow: 'hidden' }]}>
                        {renderContent()}
                    </View>
                </LinearGradient>
            ) : (
                <View style={cardStyle}>
                    {isGlass && (
                        <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
                            <BlurView
                                intensity={Platform.OS === 'ios' ? 85 : 55}
                                tint="dark"
                                style={StyleSheet.absoluteFill}
                                experimentalBlurMethod="dimezisBlurView"
                            />
                            {/* Base tint for better text contrast */}
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10, 10, 12, 0.45)' }]} />

                            {/* Very subtle icy gloss */}
                            <LinearGradient
                                colors={['rgba(215,235,255,0.07)', 'rgba(255,255,255,0.01)', 'transparent']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0.8, y: 0.8 }}
                                style={StyleSheet.absoluteFill}
                            />

                            {/* Border rim light */}
                            <View style={[StyleSheet.absoluteFill, {
                                borderRadius: 24,
                                borderWidth: 1.2,
                                borderColor: 'rgba(230,240,255,0.18)',
                                borderBottomColor: 'rgba(255,255,255,0.05)',
                                borderRightColor: 'rgba(255,255,255,0.05)',
                            }]} />
                        </View>
                    )}
                    {renderContent()}
                </View>
            )}
        </View>
    );
});

export default FeedCard;

const styles = StyleSheet.create({
    cardContainer: {
        width: SCREEN_WIDTH,
        paddingHorizontal: 16,
        paddingVertical: 12, 
        justifyContent: "center",
        // marginTop: "-1%", // removed to perfectly center organically
    },
    card: {
        flex: 1,
        borderRadius: 24,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 8,
    },
    cardTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    folderTag: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        flexShrink: 1,
        marginRight: 8,
    },
    folderDot: { width: 6, height: 6, borderRadius: 3 },
    folderTagText: {
        fontFamily: "DMSans_600SemiBold",
        fontSize: 12,
        letterSpacing: 0.3,
    },
    cardActionsContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
    },
    dueBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 20,
    },
    dueText: {
        fontFamily: "DMSans_600SemiBold",
        fontSize: 11,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
    },
    priorityDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginTop: -2, // Optical center with text
    },
    cardTitle: {
        fontFamily: "PlayfairDisplay_700Bold",
        fontSize: 22,
        lineHeight: 28,
        letterSpacing: 0.1,
    },
    carouselContainer: {
        flex: 1, // Takes up all remaining vertical space pushing the footer down
    },
    carouselSlide: {
        width: SCREEN_WIDTH - 80, // inner width of the card
        paddingRight: 10,
        paddingBottom: 20, // Revert trimming to avoid chopping bottom line
    },
    cardPreview: {
        fontFamily: "DMSans_400Regular",
        fontSize: 17, // Larger reading text
        lineHeight: 26,
    },
    paginationDots: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        marginTop: 12,
        marginBottom: 10,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    cardBottom: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 16,
        borderTopWidth: 1,
        marginTop: 10,
    },
    cardBottomLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flex: 1,
    },
    noteNameText: {
        fontFamily: "DMSans_400Regular",
        fontSize: 13,
        flex: 1,
    },
    readMoreBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    readMoreText: {
        fontFamily: "DMSans_600SemiBold",
        fontSize: 14,
    },
    pickBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        marginRight: 'auto',
        marginLeft: 8,
    },
    pickBadgeText: {
        fontFamily: "DMSans_700Bold",
        fontSize: 9,
        letterSpacing: 0.8,
    },
});
