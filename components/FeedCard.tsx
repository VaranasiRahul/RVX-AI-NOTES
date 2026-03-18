/**
 * Copyright (c) 2026 Rahul Varanasi. All Rights Reserved.
 * This file is part of RVX AI Notes — a proprietary software.
 * Unauthorized copying, distribution, or use is strictly prohibited.
 * See LICENSE file in the root directory for full terms.
 */
import React, { useState, useRef, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    FlatList,
    ScrollView,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import Markdown from "react-native-markdown-display";
import { useNotes, getTopicKey } from "@/context/NotesContext";
import { useTheme } from "@/context/ThemeContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const HEADER_HEIGHT = Platform.OS === "web" ? 67 : 62;
const TAB_BAR_HEIGHT = Platform.OS === "android" ? 110 : 120;
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
        .replace(/`{1,3}([^`]*?)`{1,3}/g, "$1")
        .replace(/!\[.*?\]\(.*?\)/g, "")
        .replace(/>\s*/g, "")
        .replace(/[-*+]\s+/g, "")
        .replace(/\d+\.\s+/g, "")
        .replace(/---/g, "")
        .replace(/\n{2,}/g, "\n")
        .trim();
}

// ── Premium Card V2 ───────────────────────────────────────────────────────────

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
    const isMidnight = theme === 'midnightGlass';

    // ── Text chunking ─────────────────────────────────────────────────────────
    const chunks: string[] = [];
    const chunkSize = typeof cardHeight === 'number' && cardHeight < CARD_HEIGHT ? 520 : 800;
    if (rawText.length <= chunkSize) {
        chunks.push(rawText);
    } else {
        let currentIdx = 0;
        while (currentIdx < rawText.length) {
            let nextIdx = currentIdx + chunkSize;
            if (nextIdx < rawText.length) {
                const spaceIdx = rawText.lastIndexOf(" ", nextIdx);
                if (spaceIdx > currentIdx + (chunkSize - 100)) {
                    nextIdx = spaceIdx;
                }
            }
            chunks.push(rawText.slice(currentIdx, nextIdx).trim());
            currentIdx = nextIdx + 1;
        }
    }

    const [activeIndex, setActiveIndex] = useState(0);
    const activeIndexRef = useRef(0);
    const carouselRef = useRef<FlatList>(null);

    const scrollRefs = useRef<Record<number, any>>({});

    // ── Auto-advance: when scrollView pulls past the bottom, swipe to next ──
    const handleScrollEnd = useCallback((chunkIdx: number, e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (chunkIdx >= chunks.length - 1) return; // already at last slide
        if (chunkIdx !== activeIndexRef.current) return; // only process scroll for active slide

        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        const maxOffset = contentSize.height - layoutMeasurement.height;
        
        // We add 120px padding to the bottom of non-last slides (see ScrollView props).
        // If they scroll past the text into this padding area (e.g., > maxOffset - 40),
        // we trigger the advance. Doing this on scroll END prevents gesture conflicts
        // that cause the FlatList to get stuck mid-scroll.
        if (maxOffset > 0 && contentOffset.y > maxOffset - 40) {
            activeIndexRef.current = chunkIdx + 1; // preemptively update to prevent double firing
            carouselRef.current?.scrollToIndex({ index: chunkIdx + 1, animated: true });
            
            // Instantly snap the current scroll view back to the bottom of the text.
            // maxOffset includes the 100px View and 120px padding. Subtracting 250 
            // completely hides the "Keep pulling" indicator so it isn't seen when swiping back.
            setTimeout(() => {
                scrollRefs.current[chunkIdx]?.scrollTo({ y: Math.max(0, maxOffset - 250), animated: false });
            }, 500);
        }
    }, [chunks.length]);

    const handleCarouselScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const slide = Math.round(
            e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width
        );
        if (slide !== activeIndex) {
            activeIndexRef.current = slide;
            setActiveIndex(slide);
        }
    }, [activeIndex]);

    // ── Markdown theme ────────────────────────────────────────────────────────
    const textColor = isGlass ? "#FFFFFF" : Colors.textSecondary;
    const headingColor = isGlass ? "#FFFFFF" : Colors.text;
    const markdownStyles = StyleSheet.create({
        body: { fontFamily: "DMSans_400Regular", fontSize: 16, color: textColor, lineHeight: 26, backgroundColor: "transparent" },
        heading1: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: headingColor, marginTop: 16, marginBottom: 8, lineHeight: 28 },
        heading2: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: headingColor, marginTop: 14, marginBottom: 6, lineHeight: 26 },
        heading3: { fontFamily: "DMSans_600SemiBold", fontSize: 16, color: headingColor, marginTop: 12, marginBottom: 4, lineHeight: 24 },
        heading4: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: headingColor, marginTop: 10, marginBottom: 2 },
        paragraph: { fontFamily: "DMSans_400Regular", fontSize: 16, color: textColor, lineHeight: 26, marginBottom: 8 },
        strong: { fontFamily: "DMSans_600SemiBold", color: headingColor },
        em: { fontStyle: "italic", color: textColor },
        s: { textDecorationLine: "line-through", color: Colors.textMuted },
        code_inline: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 13, backgroundColor: isGlass ? 'rgba(255,255,255,0.08)' : Colors.surfaceElevated, color: Colors.accentLight, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
        fence: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 13, backgroundColor: isGlass ? 'rgba(255,255,255,0.06)' : Colors.surfaceElevated, color: Colors.accentLight, padding: 14, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: Colors.accent, marginVertical: 8, lineHeight: 18 },
        blockquote: { backgroundColor: Colors.accent + "0D", borderLeftWidth: 3, borderLeftColor: Colors.accent, paddingLeft: 12, paddingVertical: 6, marginVertical: 8, borderRadius: 6 },
        bullet_list: { marginBottom: 8 },
        ordered_list: { marginBottom: 8 },
        list_item: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
        bullet_list_icon: { marginRight: 8, marginTop: 8, width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.accent },
        ordered_list_icon: { fontFamily: "DMSans_600SemiBold", fontSize: 14, color: Colors.accent, marginRight: 8, minWidth: 16 },
        hr: { backgroundColor: Colors.border, height: 1, marginVertical: 12 },
        link: { color: Colors.accent, textDecorationLine: "underline" },
        table: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginVertical: 8, overflow: "hidden" },
        thead: { backgroundColor: isGlass ? 'rgba(255,255,255,0.06)' : Colors.surfaceElevated },
        th: { fontFamily: "DMSans_600SemiBold", fontSize: 13, color: headingColor, padding: 8, borderRightWidth: 1, borderRightColor: Colors.border },
        tr: { borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: "row" },
        td: { fontFamily: "DMSans_400Regular", fontSize: 13, color: textColor, padding: 8, borderRightWidth: 1, borderRightColor: Colors.border, flex: 1 },
    });

    // ── Card surface ──────────────────────────────────────────────────────────
    const cardSurfaceStyle = [
        styles.card,
        {
            backgroundColor: isGlass ? 'transparent' : Colors.card,
            borderColor: isGlass
                ? 'transparent'
                : item.isDailyPick
                    ? 'transparent'
                    : (isMidnight ? 'rgba(255,255,255,0.06)' : Colors.border),
            borderWidth: isGlass ? 0 : (item.isDailyPick ? 0 : 1),
        },
    ];

    // ── Content ───────────────────────────────────────────────────────────────
    const renderContent = () => (
        <>
            {/* ── Directional ambient glow (top-left) ──────────────────────── */}
            {!isGlass && (
                <LinearGradient
                    colors={[item.folderColor + '0E', item.folderColor + '06', 'transparent', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.8, y: 0.8 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
                />
            )}

            {/* ── Subtle dithered texture overlay ──────────────────────────── */}
            {!isGlass && isMidnight && (
                <LinearGradient
                    colors={['rgba(255,255,255,0.015)', 'transparent', 'rgba(255,255,255,0.008)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
                />
            )}

            {/* ── Top rim light ─────────────────────────────────────────────── */}
            {!isGlass && !item.isDailyPick && (
                <View style={[StyleSheet.absoluteFill, {
                    borderRadius: 28,
                    borderTopWidth: 1,
                    borderTopColor: isMidnight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                    borderLeftWidth: 0.5,
                    borderLeftColor: isMidnight ? 'rgba(255,255,255,0.04)' : 'transparent',
                    borderRightWidth: 0,
                    borderBottomWidth: 0,
                    borderRightColor: 'transparent',
                    borderBottomColor: 'transparent',
                }]} />
            )}

            <TouchableOpacity
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPress();
                }}
                activeOpacity={0.75}
            >
                {/* ── Editorial breadcrumb header ───────────────────────────── */}
                <View style={styles.cardTop}>
                    <View style={styles.breadcrumbRow}>
                        <Text style={[styles.breadcrumbFolder, { color: item.folderColor }]} numberOfLines={1}>
                            {item.folderName}
                        </Text>
                        <Text style={[styles.breadcrumbSep, { color: isGlass ? 'rgba(255,255,255,0.2)' : Colors.textMuted }]}>·</Text>
                        <Text
                            style={[styles.breadcrumbNote, { color: isGlass ? 'rgba(255,255,255,0.4)' : Colors.textMuted }]}
                            numberOfLines={1}
                        >
                            {item.noteTitle}
                        </Text>
                    </View>

                    {/* Bookmark */}
                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            onToggleMark();
                        }}
                        style={[
                            styles.bookmarkBtn,
                            {
                                backgroundColor: isMarked
                                    ? Colors.accent + '20'
                                    : (isGlass ? 'rgba(255,255,255,0.08)' : (isMidnight ? 'rgba(255,255,255,0.06)' : Colors.surface)),
                                borderColor: isMarked
                                    ? Colors.accent + '40'
                                    : (isGlass ? 'rgba(255,255,255,0.12)' : 'transparent'),
                            },
                        ]}
                    >
                        <Ionicons
                            name={isMarked ? "bookmark" : "bookmark-outline"}
                            size={15}
                            color={isMarked ? Colors.accent : (isGlass ? 'rgba(255,255,255,0.5)' : Colors.textMuted)}
                        />
                    </TouchableOpacity>
                </View>

                {/* ── Title with inline rating dot ──────────────────────────── */}
                <Animated.View
                    key={`${item.id}-title`}
                    entering={FadeIn.duration(400)}
                    layout={LinearTransition}
                >
                    <View style={styles.titleRow}>
                        {item.lastRating === 'hard' && <View style={[styles.inlineDot, { backgroundColor: Colors.error }]} />}
                        {item.lastRating === 'easy' && <View style={[styles.inlineDot, { backgroundColor: Colors.success }]} />}
                        <Text
                            style={[styles.cardTitle, { color: isGlass ? "#FFFFFF" : Colors.text }]}
                            numberOfLines={2}
                        >
                            {item.title}
                        </Text>
                    </View>
                </Animated.View>

                {/* Daily pick label */}
                {item.isDailyPick && (
                    <View style={[styles.pickBadge, { backgroundColor: Colors.streak + '15', borderColor: Colors.streak + '35' }]}>
                        <Ionicons name="sparkles" size={10} color={Colors.streak} />
                        <Text style={[styles.pickBadgeText, { color: Colors.streak }]}>TODAY'S PICK</Text>
                    </View>
                )}
            </TouchableOpacity>

            {/* ── Divider ───────────────────────────────────────────────────── */}
            <LinearGradient
                colors={['transparent', isGlass ? 'rgba(255,255,255,0.08)' : (isMidnight ? 'rgba(255,255,255,0.06)' : Colors.border), 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.divider}
            />

            {/* ── Carousel ──────────────────────────────────────────────────── */}
            <View style={styles.carouselContainer}>
                <FlatList
                    ref={carouselRef}
                    data={chunks}
                    keyExtractor={(_, i) => `chunk-${i}`}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    onMomentumScrollEnd={handleCarouselScroll}
                    renderItem={({ item: chunkText, index: chunkIdx }) => (
                        <View style={styles.carouselSlide}>
                            <ScrollView
                                ref={(el) => { if (el) scrollRefs.current[chunkIdx] = el; }}
                                nestedScrollEnabled
                                showsVerticalScrollIndicator={false}
                                scrollEventThrottle={16}
                                onScrollEndDrag={(e) => handleScrollEnd(chunkIdx, e)}
                                onMomentumScrollEnd={(e) => handleScrollEnd(chunkIdx, e)}
                                contentContainerStyle={{
                                    paddingBottom: chunkIdx < chunks.length - 1 ? 120 : 20
                                }}
                            >
                                <Markdown style={markdownStyles as any}>
                                    {chunkText}
                                </Markdown>
                                
                                {/* Visual cue to keep swiping up */}
                                {chunkIdx < chunks.length - 1 && (
                                    <View style={{ height: 100, alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                        <Ionicons name="chevron-down-outline" size={20} color={textColor} style={{ opacity: 0.6, marginBottom: 4 }} />
                                        <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 12, color: textColor, opacity: 0.6 }}>
                                            Keep pulling for next page
                                        </Text>
                                    </View>
                                )}
                            </ScrollView>
                        </View>
                    )}
                />
            </View>

            {/* ── Bottom meta bar ───────────────────────────────────────────── */}
            <TouchableOpacity
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPress();
                }}
                activeOpacity={0.75}
            >
                <View style={styles.metaBar}>
                    <View style={styles.metaLeft}>
                        {/* Capsule pagination dots */}
                        {chunks.length > 1 && (
                            <View style={styles.metaDots}>
                                {chunks.map((_, i) => (
                                    <View
                                        key={i}
                                        style={[
                                            i === activeIndex ? styles.dotActive : styles.dot,
                                            {
                                                backgroundColor: i === activeIndex
                                                    ? Colors.accent
                                                    : (isGlass ? 'rgba(255,255,255,0.2)' : Colors.border),
                                            },
                                        ]}
                                    />
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Open button */}
                    <View style={[styles.openBtn, { backgroundColor: Colors.accent + '12', borderColor: Colors.accent + '28' }]}>
                        <Text style={[styles.openBtnText, { color: Colors.accent }]}>Open</Text>
                        <Ionicons name="arrow-forward" size={12} color={Colors.accent} />
                    </View>
                </View>
            </TouchableOpacity>
        </>
    );

    // ── Outer wrapper ─────────────────────────────────────────────────────────
    return (
        <View style={[styles.cardContainer, { height: cardHeight }]}>
            {/* Ambient glow behind the card */}
            {!isGlass && (
                <View style={[styles.ambientGlow, { backgroundColor: item.folderColor + '06', shadowColor: item.folderColor }]} />
            )}

            {item.isDailyPick ? (
                <LinearGradient
                    colors={[Colors.streak, '#FF8A65', Colors.streak]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.card, { padding: 1.2, backgroundColor: 'transparent' }]}
                >
                    <View style={[cardSurfaceStyle, { flex: 1, margin: 0, borderWidth: 0, overflow: 'hidden' }]}>
                        {renderContent()}
                    </View>
                </LinearGradient>
            ) : (
                <View style={cardSurfaceStyle}>
                    {isGlass && (
                        <View style={[StyleSheet.absoluteFill, { borderRadius: 28, overflow: 'hidden' }]}>
                            <BlurView
                                intensity={Platform.OS === 'ios' ? 90 : 60}
                                tint="dark"
                                style={StyleSheet.absoluteFill}
                                experimentalBlurMethod="dimezisBlurView"
                            />
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 8, 12, 0.5)' }]} />
                            <LinearGradient
                                colors={[
                                    item.folderColor + '10',
                                    'rgba(120,119,198,0.05)',
                                    'transparent',
                                    'rgba(99,102,241,0.03)',
                                ]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <View style={[StyleSheet.absoluteFill, {
                                borderRadius: 28,
                                borderWidth: 1,
                                borderTopColor: 'rgba(255,255,255,0.15)',
                                borderLeftColor: 'rgba(255,255,255,0.08)',
                                borderRightColor: 'rgba(255,255,255,0.03)',
                                borderBottomColor: 'rgba(255,255,255,0.02)',
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    cardContainer: {
        width: SCREEN_WIDTH,
        paddingHorizontal: 16,
        paddingVertical: 6,
        justifyContent: "center",
    },
    ambientGlow: {
        position: 'absolute',
        top: 30,
        bottom: 30,
        left: 30,
        right: 30,
        borderRadius: 40,
        opacity: 0.5,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 35,
        elevation: 0,
    },
    card: {
        flex: 1,
        borderRadius: 28,
        padding: 22,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
        elevation: 12,
        overflow: 'hidden',
    },

    // ── Header ────────────────────────────────────────────────────────────
    cardTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
        zIndex: 1,
    },
    breadcrumbRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flex: 1,
        marginRight: 8,
    },
    breadcrumbFolder: {
        fontFamily: "DMSans_600SemiBold",
        fontSize: 13,
        letterSpacing: 0.3,
        flexShrink: 0,
    },
    breadcrumbSep: {
        fontSize: 14,
        fontFamily: "DMSans_400Regular",
    },
    breadcrumbNote: {
        fontFamily: "DMSans_400Regular",
        fontSize: 13,
        flexShrink: 1,
    },
    bookmarkBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        flexShrink: 0,
    },

    // ── Title ─────────────────────────────────────────────────────────────
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 4,
        zIndex: 1,
    },
    inlineDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        flexShrink: 0,
        marginTop: 2,
    },
    cardTitle: {
        fontFamily: "PlayfairDisplay_700Bold",
        fontSize: 21,
        lineHeight: 28,
        letterSpacing: 0.1,
        flex: 1,
    },
    pickBadge: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: 'flex-start',
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        marginTop: 6,
        marginBottom: 2,
        zIndex: 1,
    },
    pickBadgeText: {
        fontFamily: "DMSans_700Bold",
        fontSize: 9,
        letterSpacing: 0.8,
    },

    // ── Divider ───────────────────────────────────────────────────────────
    divider: {
        height: 1,
        marginVertical: 10,
    },

    // ── Carousel ──────────────────────────────────────────────────────────
    carouselContainer: {
        flex: 1,
    },
    carouselSlide: {
        width: SCREEN_WIDTH - 76,
        paddingRight: 10,
        paddingBottom: 12,
    },

    // ── Bottom Meta Bar ───────────────────────────────────────────────────
    metaBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 4,
    },
    metaLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        flex: 1,
    },
    metaDots: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    dotActive: {
        width: 16,
        height: 5,
        borderRadius: 2.5,
    },
    openBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    openBtnText: {
        fontFamily: "DMSans_600SemiBold",
        fontSize: 13,
    },
});
