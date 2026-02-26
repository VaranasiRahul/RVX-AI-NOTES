import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useNotes, parseTopics, Note, Folder } from "@/context/NotesContext";
import Colors from "@/constants/colors";

const PAGE_SIZE = 8;

interface FeedItem {
  id: string;
  title: string;
  bodyRaw: string;
  noteId: string;
  noteTitle: string;
  folderId: string;
  folderName: string;
  folderColor: string;
  topicIndex: number;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildAllTopics(notes: Note[], folders: Folder[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const note of notes) {
    const folder = folders.find(f => f.id === note.folderId);
    if (!folder) continue;
    const topics = parseTopics(note);
    topics.forEach((topic, i) => {
      items.push({
        id: `${note.id}-${i}`,
        title: topic.title,
        bodyRaw: topic.body,
        noteId: note.id,
        noteTitle: note.title,
        folderId: note.folderId,
        folderName: folder.name,
        folderColor: folder.color,
        topicIndex: i,
      });
    });
  }
  return items;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function FeedCard({ item, index, onPress }: { item: FeedItem; index: number; onPress: () => void }) {
  const preview = stripMarkdown(item.bodyRaw);
  const previewLines = preview.split('\n').filter(l => l.trim()).slice(0, 5).join(' ');

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index % PAGE_SIZE, 5) * 60).springify()}>
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        activeOpacity={0.85}
      >
        <View style={styles.cardTop}>
          <View style={[styles.folderTag, { backgroundColor: item.folderColor + '20' }]}>
            <View style={[styles.folderDot, { backgroundColor: item.folderColor }]} />
            <Text style={[styles.folderTagText, { color: item.folderColor }]} numberOfLines={1}>
              {item.folderName}
            </Text>
          </View>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

        {previewLines.length > 0 && (
          <Text style={styles.cardPreview} numberOfLines={5}>{previewLines}</Text>
        )}

        <View style={styles.cardBottom}>
          <View style={styles.cardBottomLeft}>
            <Ionicons name="document-text-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.noteNameText} numberOfLines={1}>{item.noteTitle}</Text>
          </View>
          <View style={styles.readMoreBtn}>
            <Text style={styles.readMoreText}>Read More</Text>
            <Ionicons name="arrow-forward" size={12} color={Colors.accent} />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function StreakHeader({ currentStreak, totalTopics }: { currentStreak: number; totalTopics: number }) {
  return (
    <View style={styles.feedHeader}>
      <View style={styles.feedHeaderLeft}>
        <Text style={styles.feedTitle}>Feed</Text>
        <Text style={styles.feedSubtitle}>{totalTopics} topics • scroll to explore</Text>
      </View>
      {currentStreak > 0 && (
        <View style={styles.streakBadge}>
          <Ionicons name="flame" size={14} color={Colors.streak} />
          <Text style={styles.streakText}>{currentStreak}</Text>
        </View>
      )}
    </View>
  );
}

function FooterLoader({ loading }: { loading: boolean }) {
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={Colors.accent} size="small" />
    </View>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { streak, isLoading, notes, folders } = useNotes();

  const allTopics = useMemo(() => buildAllTopics(notes, folders), [notes, folders]);
  const [feedItems, setFeedItems] = useState<(FeedItem & { feedKey: string })[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const batchRef = useRef(0);

  const loadInitialFeed = useCallback((topics: FeedItem[]) => {
    if (topics.length === 0) {
      setFeedItems([]);
      return;
    }
    batchRef.current = 0;
    const shuffled = shuffle(topics);
    setFeedItems(shuffled.slice(0, PAGE_SIZE).map((t, i) => ({ ...t, feedKey: `b0-${i}-${t.id}` })));
  }, []);

  const loadMoreItems = useCallback(() => {
    if (loadingMore || allTopics.length === 0) return;
    setLoadingMore(true);
    setTimeout(() => {
      batchRef.current += 1;
      const batch = batchRef.current;
      const shuffled = shuffle(allTopics);
      const newItems = shuffled.slice(0, PAGE_SIZE).map((t, i) => ({
        ...t,
        feedKey: `b${batch}-${i}-${t.id}`,
      }));
      setFeedItems(prev => [...prev, ...newItems]);
      setLoadingMore(false);
    }, 400);
  }, [loadingMore, allTopics]);

  useEffect(() => {
    loadInitialFeed(allTopics);
  }, [allTopics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await new Promise(r => setTimeout(r, 500));
    loadInitialFeed(allTopics);
    setRefreshing(false);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <ActivityIndicator color={Colors.accent} size="large" style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (notes.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <StreakHeader currentStreak={streak.currentStreak} totalTopics={0} />
        <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={60} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No notes yet</Text>
          <Text style={styles.emptySubtitle}>
            Head to Folders, create a folder, add a note and start writing.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push("/(tabs)/folders")}
          >
            <Ionicons name="folder-open" size={16} color={Colors.background} />
            <Text style={styles.emptyButtonText}>Open Folders</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <FlatList
        data={feedItems}
        keyExtractor={item => item.feedKey}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === "web" ? 120 : 120 },
        ]}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMoreItems}
        onEndReachedThreshold={0.4}
        scrollEnabled={!!feedItems.length}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
        ListHeaderComponent={
          <StreakHeader currentStreak={streak.currentStreak} totalTopics={allTopics.length} />
        }
        ListFooterComponent={<FooterLoader loading={loadingMore} />}
        renderItem={({ item, index }) => (
          <FeedCard
            item={item}
            index={index}
            onPress={() =>
              router.push({
                pathname: "/topic/[folderId]/[noteId]/[topicIndex]",
                params: {
                  folderId: item.folderId,
                  noteId: item.noteId,
                  topicIndex: String(item.topicIndex),
                },
              })
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingTop: 4,
  },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 16,
  },
  feedHeaderLeft: {
    gap: 2,
  },
  feedTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    color: Colors.text,
    letterSpacing: 0.3,
  },
  feedSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.streak + "22",
    borderWidth: 1,
    borderColor: Colors.streak + "44",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  streakText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: Colors.streak,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  folderTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  folderDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  folderTagText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  cardTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: Colors.text,
    lineHeight: 27,
    letterSpacing: 0.1,
  },
  cardPreview: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cardBottomLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  noteNameText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    flex: 1,
  },
  readMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readMoreText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
  footer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
    marginTop: -40,
  },
  emptyTitle: {
    fontFamily: "PlayfairDisplay_600SemiBold",
    fontSize: 22,
    color: Colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    backgroundColor: Colors.accent,
    borderRadius: 30,
  },
  emptyButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.background,
  },
});
