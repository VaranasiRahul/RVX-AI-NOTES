import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Animated as RNAnimated,
    StatusBar,
    Platform,
    ScrollView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useNotes, getTopicKey, parseTopics } from "@/context/NotesContext";
import { getCachedTopics } from "@/lib/topicCache";
import { stripMarkdown } from "@/components/FeedCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// How long each story slide automatically stays on screen (in ms)
const STORY_DURATION = 15000;

export default function StoryScreen() {
    const { folderId, topicKey } = useLocalSearchParams<{ folderId?: string, topicKey?: string }>();
    const { notes, markedTopics, folders, toggleTopicMark } = useNotes();

    // Gather all marked topics
    const [topics, setTopics] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const progressAnim = useRef(new RNAnimated.Value(0)).current;
    const isPaused = useRef(false);

    useEffect(() => {
        async function loadMarkedTopics() {
            const all: any[] = [];

            for (const n of notes) {
                if (folderId && n.folderId !== folderId) continue;

                let t = await getCachedTopics(n.id, n.content);
                if (!t) t = parseTopics(n);
                t.forEach((topic: any, i: number) => {
                    const k = getTopicKey(n.id, i);
                    // Only include bookmarked topics
                    if (markedTopics[k]) {
                        all.push({
                            ...topic,
                            noteId: n.id,
                            noteTitle: n.title,
                            folderId: n.folderId,
                            topicIndex: i,
                            topicKey: k,
                        });
                    }
                });
            }

            setTopics(all);

            // Re-adjust index if items were removed
            if (currentIndex >= all.length && all.length > 0) {
                setCurrentIndex(all.length - 1);
            } else if (topicKey && all.length > 0) {
                const idx = all.findIndex(t => t.topicKey === topicKey);
                if (idx !== -1) setCurrentIndex(idx);
            }

            setIsLoading(false);
        }

        loadMarkedTopics();
    }, [folderId, topicKey, notes, markedTopics]);

    // Animate the progress bar for the current slide
    useEffect(() => {
        if (topics.length === 0) return;

        progressAnim.setValue(0);
        if (!isPaused.current) {
            RNAnimated.timing(progressAnim, {
                toValue: 1,
                duration: STORY_DURATION,
                useNativeDriver: false,
            }).start(({ finished }) => {
                if (finished) {
                    handleNext();
                }
            });
        }

        return () => progressAnim.stopAnimation();
    }, [currentIndex, topics.length]);

    const handleNext = () => {
        if (currentIndex < topics.length - 1) {
            setCurrentIndex((prev) => prev + 1);
        } else {
            router.back();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex((prev) => prev - 1);
        } else {
            progressAnim.setValue(0); // restart first slide
        }
    };

    const handlePress = (evt: any) => {
        const x = evt.nativeEvent.locationX;
        if (x < SCREEN_WIDTH / 3) {
            handlePrev();
        } else {
            handleNext();
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    if (topics.length === 0) {
        // Automatically close the viewer if the user unsaves the very last topic in the list 
        setTimeout(() => {
            if (router.canGoBack()) router.back();
        }, 300);

        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>No saved topics.</Text>
            </View>
        );
    }

    const currentTopic = topics[currentIndex];
    const isMarked = !!markedTopics[currentTopic.topicKey];
    const folder = folders.find(f => f.id === currentTopic.folderId) || { name: "Saved Topic", color: "#3EA6FF" };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

            {/* Tap Areas */}
            <TouchableOpacity
                activeOpacity={1}
                onPress={handlePress}
                onLongPress={() => {
                    isPaused.current = true;
                    progressAnim.stopAnimation();
                }}
                onPressOut={() => {
                    if (isPaused.current) {
                        isPaused.current = false;
                        // Resume from current value
                        const remaining = STORY_DURATION * (1 - (progressAnim as any)._value);
                        RNAnimated.timing(progressAnim, {
                            toValue: 1,
                            duration: remaining,
                            useNativeDriver: false,
                        }).start(({ finished }) => {
                            if (finished) handleNext();
                        });
                    }
                }}
                style={styles.tapArea}
            >
                {/* Content Wrapper */}
                <Animated.View
                    key={`story-slide-${currentIndex}`}
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(200)}
                    style={styles.slideContainer}
                >
                    {/* Header Progress Bars */}
                    <View style={styles.progressHeader}>
                        {topics.map((t, idx) => (
                            <View key={idx} style={styles.progressBarBg}>
                                <RNAnimated.View
                                    style={[
                                        styles.progressBarFill,
                                        {
                                            width:
                                                idx < currentIndex
                                                    ? "100%"
                                                    : idx === currentIndex
                                                        ? progressAnim.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: ["0%", "100%"],
                                                        })
                                                        : "0%",
                                        },
                                    ]}
                                />
                            </View>
                        ))}
                    </View>

                    {/* User / Folder Info Header */}
                    <View style={styles.userInfoHeader}>
                        <View style={styles.userLeft}>
                            <View style={styles.avatarPlaceholder}>
                                <Ionicons name="bookmark" size={16} color="#0F172A" />
                            </View>
                            <Text style={styles.userNameText}>Saved Topic</Text>
                            <Text style={styles.timeText}>{folder.name}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={{ padding: 4 }}
                        >
                            <Ionicons name="close" size={28} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Actual Topic Content inside the Story */}
                    <View style={styles.topicContent}>
                        <Text style={[styles.noteTitleTag, { color: folder.color }]}>{currentTopic.noteTitle}</Text>
                        <Text style={styles.topicTitle}>{currentTopic.title}</Text>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 100 }}
                        >
                            <Text style={styles.topicBody}>
                                {stripMarkdown(currentTopic.body)}
                            </Text>
                        </ScrollView>
                    </View>

                </Animated.View>
            </TouchableOpacity>

            {/* Bottom Action Bar */}
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push({
                            pathname: "/topic/[folderId]/[noteId]/[topicIndex]",
                            params: {
                                folderId: currentTopic.folderId,
                                noteId: currentTopic.noteId,
                                topicIndex: String(currentTopic.topicIndex),
                            },
                        });
                    }}
                >
                    <Text style={styles.actionBtnText}>Study Topic</Text>
                    <Ionicons name="chevron-forward" size={16} color="#fff" />
                </TouchableOpacity>

                <View style={styles.rightActions}>
                    <TouchableOpacity
                        onPress={() => {
                            toggleTopicMark(currentTopic.noteId, currentTopic.topicIndex);
                        }}
                    >
                        {isMarked ? (
                            <Ionicons name="bookmark" size={26} color="#3EA6FF" />
                        ) : (
                            <Ionicons name="bookmark-outline" size={26} color="#ffffff88" />
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // Modern dark slate background instead of generic yellow/folder color
        backgroundColor: "#0F172A",
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: "#0F172A",
        alignItems: "center",
        justifyContent: "center",
    },
    loadingText: {
        color: "#fff",
        fontFamily: "DMSans_400Regular",
    },
    tapArea: {
        flex: 1,
    },
    slideContainer: {
        flex: 1,
        paddingTop: Platform.OS === "ios" ? 60 : 20,
    },
    progressHeader: {
        flexDirection: "row",
        paddingHorizontal: 10,
        gap: 4,
        marginBottom: 12,
    },
    progressBarBg: {
        flex: 1,
        height: 2,
        backgroundColor: "rgba(255,255,255,0.2)",
        borderRadius: 1,
        overflow: "hidden",
    },
    progressBarFill: {
        height: "100%",
        backgroundColor: "#fff",
    },
    userInfoHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        marginBottom: 20,
    },
    userLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    avatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#fff", // White badge
        alignItems: "center",
        justifyContent: "center",
    },
    userNameText: {
        color: "#fff",
        fontFamily: "DMSans_600SemiBold",
        fontSize: 14,
    },
    timeText: {
        color: "rgba(255,255,255,0.6)",
        fontFamily: "DMSans_400Regular",
        fontSize: 12,
    },
    topicContent: {
        flex: 1,
        paddingHorizontal: 24,
    },
    noteTitleTag: {
        fontFamily: "DMSans_600SemiBold",
        fontSize: 12,
        letterSpacing: 1,
        textTransform: "uppercase",
        marginBottom: 12,
    },
    topicTitle: {
        color: "#fff",
        fontFamily: "PlayfairDisplay_700Bold",
        fontSize: 32,
        lineHeight: 40,
        marginBottom: 24,
    },
    topicBody: {
        color: "rgba(255,255,255,0.9)",
        fontFamily: "DMSans_400Regular",
        fontSize: 18,
        lineHeight: 28,
    },
    bottomBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingBottom: Platform.OS === "ios" ? 40 : 20,
        paddingTop: 10,
    },
    actionBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.4)",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 30,
    },
    actionBtnText: {
        color: "#fff",
        fontFamily: "DMSans_600SemiBold",
        fontSize: 14,
    },
    rightActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
    },
});
