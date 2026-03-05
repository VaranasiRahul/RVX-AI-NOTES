import React, { useMemo } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
} from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

export interface StoryItem {
    id: string;
    title: string;
    type: "folder" | "marked";
    color: string;
    keyData: any; // e.g Folder ID or Topic Data
}

export default function StoriesBar({
    stories,
    Colors,
    onPressStory,
}: {
    stories: StoryItem[];
    Colors: any;
    onPressStory: (story: StoryItem) => void;
}) {
    if (stories.length === 0) return null;

    return (
        <View style={[styles.storiesContainer, { backgroundColor: Colors.background }]}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {stories.map((story, i) => (
                    <Animated.View
                        key={`story-${story.id}-${i}`}
                        entering={FadeInRight.delay(i * 100).springify()}
                        style={styles.storyWrapper}
                    >
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                onPressStory(story);
                            }}
                            style={styles.storyCircleContainer}
                        >
                            <View style={styles.storyRing}>
                                <Svg width="72" height="72" viewBox="0 0 72 72" style={StyleSheet.absoluteFill}>
                                    <G rotation="-90" origin="36, 36">
                                        <Circle
                                            cx="36"
                                            cy="36"
                                            r="33.5"
                                            stroke={story.color}
                                            strokeWidth="2.5"
                                            fill="transparent"
                                            strokeDasharray={`${(2 * Math.PI * 33.5) / 4 - 10} 10`}
                                            strokeLinecap="round"
                                        />
                                    </G>
                                </Svg>
                                <View
                                    style={[
                                        styles.storyIconContainer,
                                        { backgroundColor: Colors.background },
                                    ]}
                                >
                                    <Ionicons
                                        name={story.type === "folder" ? "folder-open" : "bookmark"}
                                        size={26}
                                        color={story.color}
                                    />
                                </View>
                            </View>
                        </TouchableOpacity>
                        <Text
                            style={[styles.storyTitle, { color: Colors.textSecondary }]}
                            numberOfLines={1}
                        >
                            {story.title}
                        </Text>
                    </Animated.View>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    storiesContainer: {
        paddingVertical: 12,
        borderBottomWidth: 0,
    },
    scrollContent: {
        paddingHorizontal: 16,
        gap: 16,
    },
    storyWrapper: {
        alignItems: "center",
        width: 72,
    },
    storyCircleContainer: {
        marginBottom: 6,
    },
    // Instagram style 3-layer ring
    storyRing: {
        width: 72,
        height: 72,
        alignItems: "center",
        justifyContent: "center",
    },
    storyIconContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: "center",
        justifyContent: "center",
    },
    storyTitle: {
        fontFamily: "DMSans_400Regular",
        fontSize: 11,
        textAlign: "center",
    },
});
