import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useNotes } from "@/context/NotesContext";
import Colors from "@/constants/colors";

function StreakBadge({ count }: { count: number }) {
  return (
    <Animated.View entering={FadeIn.delay(200)} style={styles.streakBadge}>
      <Ionicons name="flame" size={14} color={Colors.streak} />
      <Text style={styles.streakBadgeText}>{count} day streak</Text>
    </Animated.View>
  );
}

function EmptyState({ onGoToFolders }: { onGoToFolders: () => void }) {
  return (
    <Animated.View entering={FadeInDown.delay(300)} style={styles.emptyContainer}>
      <Ionicons name="book-outline" size={56} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>No notes yet</Text>
      <Text style={styles.emptySubtitle}>
        Create a folder and add notes to start your daily revision practice.
      </Text>
      <TouchableOpacity style={styles.emptyButton} onPress={onGoToFolders}>
        <Text style={styles.emptyButtonText}>Go to Folders</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function TopicCard({
  title,
  body,
  noteId,
  folderId,
  topicIndex,
  folderName,
  folderColor,
  onPress,
}: {
  title: string;
  body: string;
  noteId: string;
  folderId: string;
  topicIndex: number;
  folderName: string;
  folderColor: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const preview = body.split('\n').slice(0, 4).join('\n').trim();

  return (
    <Animated.View entering={FadeInDown.delay(400).springify()} style={animStyle}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => { scale.value = withSpring(0.97); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
      >
        <View style={styles.card}>
          <View style={styles.cardAccentBar} />

          <View style={styles.cardHeader}>
            <View style={[styles.folderTag, { backgroundColor: folderColor + '22' }]}>
              <View style={[styles.folderDot, { backgroundColor: folderColor }]} />
              <Text style={[styles.folderTagText, { color: folderColor }]}>{folderName}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </View>

          <Text style={styles.cardTitle}>{title}</Text>

          {preview.length > 0 && (
            <Text style={styles.cardPreview} numberOfLines={4}>{preview}</Text>
          )}

          <View style={styles.cardFooter}>
            <Ionicons name="eye-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.cardFooterText}>Tap to read full notes</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { streak, isLoading, getDailyTopicData, rollDailyTopic, markRevised, folders, notes } = useNotes();
  const [refreshing, setRefreshing] = React.useState(false);
  const [hasRevised, setHasRevised] = React.useState(false);

  const topic = getDailyTopicData();
  const folder = topic ? folders.find(f => f.id === topic.folderId) : null;

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (streak.history.includes(today)) {
      setHasRevised(true);
    }
  }, [streak.history]);

  const handleRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await rollDailyTopic();
    setRefreshing(false);
  };

  const handleRevised = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markRevised();
    setHasRevised(true);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  const hasNotes = notes.length > 0;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 100 : 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
      >
        <Animated.View entering={FadeIn.duration(600)}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.dateLabel}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </Text>
              <Text style={styles.headerTitle}>Daily Revision</Text>
            </View>
            {streak.currentStreak > 0 && <StreakBadge count={streak.currentStreak} />}
          </View>
        </Animated.View>

        {!hasNotes ? (
          <EmptyState onGoToFolders={() => router.push("/(tabs)/folders")} />
        ) : topic && folder ? (
          <>
            <TopicCard
              title={topic.title}
              body={topic.body}
              noteId={topic.noteId}
              folderId={topic.folderId}
              topicIndex={topic.topicIndex}
              folderName={folder.name}
              folderColor={folder.color}
              onPress={() =>
                router.push({
                  pathname: "/topic/[folderId]/[noteId]/[topicIndex]",
                  params: {
                    folderId: topic.folderId,
                    noteId: topic.noteId,
                    topicIndex: String(topic.topicIndex),
                  },
                })
              }
            />

            <Animated.View entering={FadeInDown.delay(600)} style={styles.actions}>
              {!hasRevised ? (
                <TouchableOpacity style={styles.revisedButton} onPress={handleRevised}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.background} />
                  <Text style={styles.revisedButtonText}>Mark as Revised</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.revisedDone}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={styles.revisedDoneText}>Revised today!</Text>
                </View>
              )}

              <TouchableOpacity style={styles.rollButton} onPress={handleRefresh}>
                <Ionicons name="shuffle" size={18} color={Colors.accent} />
                <Text style={styles.rollButtonText}>New Topic</Text>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(700)} style={styles.hint}>
              <Ionicons name="arrow-down" size={13} color={Colors.textMuted} />
              <Text style={styles.hintText}>Pull down to get a new random topic</Text>
            </Animated.View>
          </>
        ) : (
          <EmptyState onGoToFolders={() => router.push("/(tabs)/folders")} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  dateLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    color: Colors.text,
    letterSpacing: 0.3,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.streak + "22",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.streak + "44",
  },
  streakBadgeText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.streak,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    overflow: "hidden",
    position: "relative",
  },
  cardAccentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.accent,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    marginTop: 4,
  },
  folderTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  folderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  folderTagText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
  },
  cardTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    color: Colors.text,
    marginBottom: 14,
    lineHeight: 32,
  },
  cardPreview: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: 20,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cardFooterText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  revisedButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 14,
  },
  revisedButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.background,
  },
  revisedDone: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.success + "22",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.success + "44",
  },
  revisedDoneText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.success,
  },
  rollButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  rollButtonText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: Colors.accent,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  hintText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "PlayfairDisplay_600SemiBold",
    fontSize: 22,
    color: Colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 24,
  },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: Colors.accent,
    borderRadius: 30,
  },
  emptyButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.background,
  },
});
