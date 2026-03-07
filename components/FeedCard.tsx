/**
 * Copyright (c) 2026 Rahul Varanasi. All Rights Reserved.
 * This file is part of RVX AI Notes — a proprietary software.
 * Unauthorized copying, distribution, or use is strictly prohibited.
 * See LICENSE file in the root directory for full terms.
 */
import React, { useState, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    FlatList,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useNotes, getTopicKey } from "@/context/NotesContext";
import { useTheme } from "@/context/ThemeContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// This height calculation matches the vertical snap interval of the Home Feed
const HEADER_HEIGHT = Platform.OS === "web" ? 67 : 50;
const TAB_BAR_HEIGHT = 120;
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
        .replace(/`{1,3}(.*?)`{1,3}/g, "$1")
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
    const plainText = stripMarkdown(item.bodyRaw).trim();

    // Adjust chunkSize based on available vertical space.
    // At fontSize 17, lineHeight 26, a 500-character chunk is a safe limit for a partial-height card to allow for footer/dots.
    const chunks: string[] = [];
    const chunkSize = typeof cardHeight === 'number' && cardHeight < CARD_HEIGHT ? 520 : 800;
    if (plainText.length <= chunkSize) {
        chunks.push(plainText);
    } else {
        let currentIdx = 0;
        while (currentIdx < plainText.length) {
            // Find a space near the chunk boundary to keep words intact
            let nextIdx = currentIdx + chunkSize;
            if (nextIdx < plainText.length) {
                const spaceIdx = plainText.lastIndexOf(" ", nextIdx);
                // Only backtrack if the space is not too far back (within 80 chars)
                if (spaceIdx > currentIdx + (chunkSize - 100)) {
                    nextIdx = spaceIdx;
                }
            }
            chunks.push(plainText.slice(currentIdx, nextIdx).trim());
            currentIdx = nextIdx + 1;
        }
    }

    const [activeIndex, setActiveIndex] = useState(0);

    const cardTextColor = isGlass ? "#FFFFFF" : Colors.textSecondary;

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
                            <Text style={[styles.pickBadgeText, { color: Colors.streak }]}>TODAY'S PICK</Text>
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
                        <Text
                            style={[
                                styles.cardTitle,
                                { color: isGlass ? "#FFFFFF" : Colors.text, flex: 1 }
                            ]}
                            numberOfLines={4}
                        >
                            {stripMarkdown(item.title)}
                        </Text>
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
                            <Text
                                style={[styles.cardPreview, { color: cardTextColor }]}
                            >
                                {chunkText}
                            </Text>
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
        paddingVertical: 12, // vertical padding instead of padding bottom to center it
        justifyContent: "center",
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
        paddingBottom: 32, // Enforced one-line gap above interactive elements
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
