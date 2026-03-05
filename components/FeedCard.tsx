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
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useNotes, getTopicKey } from "@/context/NotesContext";

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

export default function FeedCard({
    item,
    index,
    onPress,
    Colors,
}: {
    item: FeedItem;
    index: number;
    onPress: () => void;
    Colors: any;
}) {
    const { markedTopics, toggleTopicMark } = useNotes();
    const plainText = stripMarkdown(item.bodyRaw).trim();
    const topicKey = getTopicKey(item.noteId, item.topicIndex);
    const isMarked = !!markedTopics[topicKey];

    // Chunking the plain text into segments of ~400 characters for the horizontal carousel
    // to mimic an Instagram multi-slide post if the text is too long.
    const chunks: string[] = [];
    const chunkSize = 1100; // Increased from 400 to better utilize card height
    if (plainText.length <= chunkSize) {
        chunks.push(plainText);
    } else {
        let currentIdx = 0;
        while (currentIdx < plainText.length) {
            // Find a space near the chunk boundary to keep words intact
            let nextIdx = currentIdx + chunkSize;
            if (nextIdx < plainText.length) {
                const spaceIdx = plainText.lastIndexOf(" ", nextIdx);
                if (spaceIdx > currentIdx) {
                    nextIdx = spaceIdx;
                }
            }
            chunks.push(plainText.slice(currentIdx, nextIdx).trim());
            currentIdx = nextIdx + 1;
        }
    }

    const [activeIndex, setActiveIndex] = useState(0);

    return (
        <View style={[styles.cardContainer, { height: CARD_HEIGHT }]}>
            <View
                style={[
                    styles.card,
                    {
                        backgroundColor: Colors.card,
                        borderColor: item.isDue ? Colors.accent + "44" : Colors.border,
                    },
                ]}
            >
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
                        <View style={styles.cardActionsContainer}>
                            {item.isDue && (
                                <View
                                    style={[
                                        styles.dueBadge,
                                        { backgroundColor: Colors.accent + "22" },
                                    ]}
                                >
                                    <Ionicons name="time-outline" size={12} color={Colors.accent} />
                                    <Text style={[styles.dueText, { color: Colors.accent }]}>
                                        Review Due
                                    </Text>
                                </View>
                            )}
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    toggleTopicMark(item.noteId, item.topicIndex);
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

                    <Text
                        style={[styles.cardTitle, { color: Colors.text }]}
                        numberOfLines={4}
                    >
                        {stripMarkdown(item.title)}
                    </Text>
                </TouchableOpacity>

                {/* Horizontal Carousel for Notes */}
                <View style={styles.carouselContainer}>
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
                                    style={[styles.cardPreview, { color: Colors.textSecondary }]}
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
                </View>

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
                            { borderTopColor: Colors.border },
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
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    cardContainer: {
        width: SCREEN_WIDTH,
        paddingHorizontal: 16,
        paddingVertical: 12, // vertical padding instead of padding bottom to center it
        justifyContent: "center",
    },
    card: {
        flex: 1, // fill the available vertical space inside the snap container
        borderRadius: 24, // softer, bigger edges like premium social apps
        borderWidth: 1.5,
        padding: 24, // breathing room
        // Add subtle shadow for depth
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
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
    cardTitle: {
        fontFamily: "PlayfairDisplay_700Bold",
        fontSize: 22,
        lineHeight: 28,
        letterSpacing: 0.1,
        marginBottom: 16,
    },
    carouselContainer: {
        flex: 1, // Takes up all remaining vertical space pushing the footer down
    },
    carouselSlide: {
        width: SCREEN_WIDTH - 80, // inner width of the card
        paddingRight: 10,
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
        marginTop: 10,
        marginBottom: 5,
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
});
