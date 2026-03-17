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
  TextInput,
  Animated as RNAnimated,
  ScrollView,
  Dimensions,
} from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollToTop } from "@react-navigation/native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
import { router } from "expo-router";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useNotes, parseTopics, Note, Folder, getTopicKey, useAiSyncStatus } from "@/context/NotesContext";
import { onCacheUpdated } from "@/lib/topicCache";
import { useTheme } from "@/context/ThemeContext";
import FeedCard, { CARD_HEIGHT } from "@/components/FeedCard";
import StoriesBar, { StoryItem } from "@/components/StoriesBar";
import LivingAiIcon from "@/components/LivingAiIcon";

const PAGE_SIZE = 8;

interface FeedItem {
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

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*{3}(.*?)\*{3}/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`[^`]+`/g, "[code]")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^---+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function buildAllTopicsAsync(
  notes: Note[],
  folders: Folder[],
  topicProgress: Record<string, any>
): Promise<FeedItem[]> {
  const today = new Date().toISOString().split("T")[0];
  const items: FeedItem[] = [];
  for (const note of notes) {
    const folder = folders.find((f) => f.id === note.folderId);
    if (!folder) continue;
    const { getCachedTopics } = await import('@/lib/topicCache');
    let topics = await getCachedTopics(note.id, note.content);
    if (!topics) topics = parseTopics(note);
    topics.forEach((topic, i) => {
      const key = getTopicKey(note.id, i);
      const progress = topicProgress[key];
      const isDue = !progress || progress.lastRating === 'hard' || progress.dueDate <= today;
      items.push({
        id: `${note.id}-${i}`,
        title: topic.title,
        bodyRaw: topic.body,
        summary: topic.summary,
        noteId: note.id,
        noteTitle: note.title,
        folderId: note.folderId,
        folderName: folder.name,
        folderColor: folder.color,
        topicIndex: i,
        isDue,
        lastRating: progress?.lastRating || null,
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

function buildPrioritizedTopics(items: FeedItem[]): FeedItem[] {
  const hard = shuffle(items.filter((t) => t.lastRating === 'hard'));
  const due = shuffle(items.filter((t) => t.isDue && t.lastRating !== 'hard'));
  const notDue = shuffle(items.filter((t) => !t.isDue && t.lastRating !== 'hard'));
  const others = [...due, ...notDue];

  const result: FeedItem[] = [];
  let hIdx = 0;
  let oIdx = 0;

  // Interleave: 1 Hard for every 2 Others
  while (hIdx < hard.length || oIdx < others.length) {
    for (let i = 0; i < 2 && oIdx < others.length; i++) {
      result.push(others[oIdx++]);
    }
    if (hIdx < hard.length) {
      result.push(hard[hIdx++]);
    }
    // Safety: if others finished, dump remaining hards
    if (oIdx >= others.length && hIdx < hard.length) {
      result.push(...hard.slice(hIdx));
      break;
    }
  }
  return result;
}

function FooterLoader({ loading, Colors }: { loading: boolean; Colors: any }) {
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={Colors.accent} size="small" />
    </View>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { streak, isLoading, notes, folders, topicProgress, getDailyTopicData, markedTopics, toggleTopicMark } = useNotes();
  const isAiSyncing = useAiSyncStatus();
  const { colors: Colors, theme } = useTheme();

  const [allTopics, setAllTopics] = useState<FeedItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const tabsScrollRef = useRef<ScrollView>(null);
  const [tabLayouts, setTabLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const [tabsContainerWidth, setTabsContainerWidth] = useState(0);

  const scrollToTab = (id: string | "all") => {
    const layout = tabLayouts[id];
    if (layout && tabsScrollRef.current && tabsContainerWidth > 0) {
      const centerX = layout.x - tabsContainerWidth / 2 + layout.width / 2;
      tabsScrollRef.current.scrollTo({ x: Math.max(0, centerX), animated: true });
    }
  };

  const loadAllTopics = useCallback(async () => {
    const items = await buildAllTopicsAsync(notes, folders, topicProgress);
    setAllTopics(items);
    return items;
  }, [notes, folders, topicProgress]);

  useEffect(() => {
    let active = true;
    loadAllTopics().then(() => { if (!active) return; });
    return () => { active = false; };
  }, [loadAllTopics]);

  useEffect(() => {
    const unsubscribe = onCacheUpdated(() => { loadAllTopics(); });
    return unsubscribe;
  }, [loadAllTopics]);

  const dueCount = useMemo(() => allTopics.filter((t) => t.isDue).length, [allTopics]);

  const storiesData = useMemo(() => {
    const stories: StoryItem[] = [];

    // Add HARD TOPICS story if any exist
    const hasHards = Object.values(topicProgress).some(p => p.lastRating === 'hard');
    if (hasHards) {
      stories.push({
        id: 'story-hard-topics',
        title: 'HARD TOPICS',
        type: 'hard',
        color: streak.currentStreak > 0 ? '#F43F5E' : Colors.accent,
        keyData: 'hard',
      });
    }

    const folderMap = new Map<string, StoryItem>();
    const markedKeys = Object.keys(markedTopics).filter(k => markedTopics[k]);
    markedKeys.forEach(topicKey => {
      const topic = allTopics.find(t => getTopicKey(t.noteId, t.topicIndex) === topicKey);
      if (!topic) return;
      const folderId = topic.folderId;
      if (!folderMap.has(folderId)) {
        folderMap.set(folderId, {
          id: `folder-marks-${folderId}`,
          title: topic.folderName || "Folder",
          type: "folder",
          color: topic.folderColor || Colors.accent,
          keyData: folderId,
        });
      }
    });

    return [...stories, ...Array.from(folderMap.values())];
  }, [markedTopics, allTopics, Colors, topicProgress, streak.currentStreak]);

  const handleStoryPress = useCallback((story: StoryItem) => {
    if (story.type === 'hard') {
      router.push(`/story?type=hard`);
    } else {
      router.push(`/story?folderId=${story.keyData}`);
    }
  }, []);

  const [feedItems, setFeedItems] = useState<(FeedItem & { feedKey: string })[]>([]);
  const flatListRef = useRef<FlatList>(null);
  useScrollToTop(flatListRef);

  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSummarizeMode, setIsSummarizeMode] = useState(false);
  const batchRef = useRef(0);

  const [dailyTopic, setDailyTopic] = useState<any>(null);
  useEffect(() => {
    let active = true;
    async function loadDaily() {
      const data = await getDailyTopicData();
      if (active) setDailyTopic(data);
    }
    loadDaily();
    return () => { active = false; };
  }, [getDailyTopicData]);

  const loadInitialFeed = useCallback((topics: FeedItem[]) => {
    if (topics.length === 0) { setFeedItems([]); return; }
    batchRef.current = 0;
    const ordered = buildPrioritizedTopics(topics);
    setFeedItems(
      ordered.slice(0, PAGE_SIZE).map((t, i) => ({ ...t, feedKey: `b0-${i}-${t.id}` }))
    );
  }, []);

  const loadMoreItems = useCallback(() => {
    if (loadingMore || allTopics.length === 0) return;
    const maxBatches = Math.ceil(allTopics.length / PAGE_SIZE) - 1;
    if (batchRef.current >= maxBatches) return;
    setLoadingMore(true);
    setTimeout(() => {
      batchRef.current += 1;
      const batch = batchRef.current;
      const ordered = buildPrioritizedTopics(allTopics);
      const newItems = ordered
        .slice(batch * PAGE_SIZE, (batch + 1) * PAGE_SIZE)
        .map((t, i) => ({ ...t, feedKey: `b${batch}-${i}-${t.id}` }));
      setFeedItems((prev) => [...prev, ...newItems]);
      setLoadingMore(false);
    }, 400);
  }, [loadingMore, allTopics]);

  useEffect(() => { loadInitialFeed(allTopics); }, [allTopics]);

  const [isStoriesOpen, setIsStoriesOpen] = useState(false);
  const storiesDrawerAnim = useRef(new RNAnimated.Value(0)).current;

  const toggleStories = () => {
    const toValue = isStoriesOpen ? 0 : 1;
    RNAnimated.spring(storiesDrawerAnim, {
      toValue, friction: 8, tension: 50, useNativeDriver: true,
    }).start();
    setIsStoriesOpen(!isStoriesOpen);
  };

  const DRAWER_WIDTH = SCREEN_WIDTH - 30;
  const drawerTranslateX = storiesDrawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -DRAWER_WIDTH],
    extrapolate: 'clamp',
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const freshTopics = await loadAllTopics();
    loadInitialFeed(freshTopics);
    setRefreshing(false);
  };

  const toggleSummarize = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSummarizeMode((v) => !v);
  };

  const displayedItems = useMemo(() => {
    let items: FeedItem[];

    if (isSummarizeMode) {
      // Summarize mode: show all topics as randomized summaries
      items = shuffle(allTopics.map(t => ({
        ...t,
        bodyRaw: t.summary || t.bodyRaw, // swap body with summary
      })));
    } else if (selectedFolderId !== null) {
      // Folder tab: pull straight from allTopics to preserve original note/block order
      items = allTopics.filter(item => item.folderId === selectedFolderId);
    } else {
      // All tab: use the shuffled prioritized feed pipeline
      items = [...feedItems];
    }

    // Hoist Today's Pick to top if present
    if (dailyTopic && selectedFolderId === null && !isSummarizeMode) {
      const pickIdx = items.findIndex(t =>
        String(t.noteId) === String(dailyTopic.noteId) &&
        Number(t.topicIndex) === Number(dailyTopic.topicIndex)
      );
      if (pickIdx !== -1) {
        const [pick] = items.splice(pickIdx, 1);
        items.unshift({ ...pick, isDailyPick: true });
      } else {
        // Fallback: If not in current feed batch, we could find it in allTopics
        const fullPick = allTopics.find(t =>
          String(t.noteId) === String(dailyTopic.noteId) &&
          Number(t.topicIndex) === Number(dailyTopic.topicIndex)
        );
        if (fullPick) {
          items.unshift({ ...fullPick, isDailyPick: true });
        }
      }
    }

    return items.map((t, i) => ({
      ...t,
      feedKey: `disp-${i}-${t.id}`,
    }));
  }, [feedItems, allTopics, isSummarizeMode, selectedFolderId, dailyTopic]);


  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const navigateToTopic = (item: { folderId: string; noteId: string; topicIndex: number }) => {
    router.push({
      pathname: "/topic/[folderId]/[noteId]/[topicIndex]",
      params: {
        folderId: item.folderId,
        noteId: item.noteId,
        topicIndex: String(item.topicIndex),
      },
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: topPad, backgroundColor: Colors.background }]}>
        <ActivityIndicator color={Colors.accent} size="large" style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (notes.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: topPad, backgroundColor: Colors.background }]}>
        <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyContainer}>
          <LivingAiIcon active={true} size={64} />
          <Text style={[styles.emptyTitle, { color: Colors.text, marginTop: 24 }]}>Welcome to RVX AI</Text>
          <Text style={[styles.emptySubtitle, { color: Colors.textSecondary, marginBottom: 30 }]}>
            Your intelligent personal knowledge base. Follow these simple steps to begin:
          </Text>

          <View style={styles.onboardingSteps}>
            <View style={styles.onboardingStep}>
              <View style={[styles.stepIcon, { backgroundColor: Colors.accent + '15' }]}>
                <Ionicons name="folder-open" size={22} color={Colors.accent} />
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, { color: Colors.text }]}>1. Create a Folder</Text>
                <Text style={[styles.stepDesc, { color: Colors.textSecondary }]}>Go to the Folders tab and create a category (e.g. Physics, Work, Daily).</Text>
              </View>
            </View>

            <View style={styles.onboardingStep}>
              <View style={[styles.stepIcon, { backgroundColor: Colors.accent + '15' }]}>
                <Ionicons name="create" size={22} color={Colors.accent} />
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, { color: Colors.text }]}>2. Add Your Notes</Text>
                <Text style={[styles.stepDesc, { color: Colors.textSecondary }]}>Add notes inside your folder. Use &quot;---&quot; to manually split topics for review.</Text>
              </View>
            </View>

            <View style={styles.onboardingStep}>
              <View style={[styles.stepIcon, { backgroundColor: Colors.accent + '15' }]}>
                <Ionicons name="sparkles" size={22} color={Colors.accent} />
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, { color: Colors.text }]}>3. Review Smarter</Text>
                <Text style={[styles.stepDesc, { color: Colors.textSecondary }]}>Your topics will appear here as cards, optimized for revision and spaced repetition.</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: Colors.accent, marginTop: 10, paddingRight: 20 }]}
            onPress={() => router.push("/(tabs)/folders")}
          >
            <Text style={[styles.emptyButtonText, { color: Colors.background }]}>Get Started</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.background} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      {isAiSyncing && (
        <Animated.View
          entering={FadeInDown}
          style={{
            backgroundColor: Colors.card,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
            paddingVertical: 10,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10,
          }}
        >
          <ActivityIndicator color={Colors.accent} size="small" style={{ marginRight: 10 }} />
          <Text style={{ color: Colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13 }}>
            AI is summarizing recent notes...
          </Text>
        </Animated.View>
      )}

      {/* Floating Right Horizontal Drawer for Stories */}
      <RNAnimated.View
        style={[
          styles.storiesDrawerWrapper,
          {
            backgroundColor: Colors.surface,
            borderColor: Colors.border,
            transform: [{ translateX: drawerTranslateX }],
            top: topPad + (Dimensions.get("window").height * 0.25),
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.drawerHandle, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
          onPress={toggleStories}
          activeOpacity={0.8}
        >
          <Ionicons name={isStoriesOpen ? "chevron-forward" : "chevron-back"} size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.drawerContentWrapper}>
          <ScrollView
            horizontal
            contentContainerStyle={{ paddingHorizontal: 16 }}
            showsHorizontalScrollIndicator={false}
          >
            {storiesData.map((story) => (
              <TouchableOpacity
                key={story.id}
                style={styles.drawerItem}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleStoryPress(story);
                }}
              >
                <View style={styles.storyRingVertical}>
                  <Svg width="60" height="60" viewBox="0 0 60 60" style={StyleSheet.absoluteFill}>
                    <G rotation="-90" origin="30, 30">
                      <Circle
                        cx="30"
                        cy="30"
                        r="28"
                        stroke={story.color || Colors.accent}
                        strokeWidth="2"
                        fill="transparent"
                        strokeDasharray={`${(2 * Math.PI * 28) / 4 - 8} 8`}
                        strokeLinecap="round"
                      />
                    </G>
                  </Svg>
                  <View style={[styles.storyInnerCircle, { backgroundColor: Colors.surface }]}>
                    <Text style={[styles.drawerItemTextInside, { color: story.color || Colors.accent }]} numberOfLines={2}>
                      {story.title}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </RNAnimated.View>

      {/* Navbar BlurView */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 39 : 25}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={[
          styles.feedHeaderContainer,
          {
            position: 'absolute',
            top: topPad + 6,
            left: 16,
            right: 16,
            borderRadius: 24,
            overflow: 'hidden',
            backgroundColor: 'rgba(10, 20, 30, 0.25)',
            borderTopWidth: 1.5,
            borderTopColor: 'rgba(255,255,255,0.2)',
            borderLeftWidth: 1,
            borderLeftColor: 'rgba(255,255,255,0.1)',
            borderRightWidth: 1,
            borderRightColor: 'rgba(255,255,255,0.05)',
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(0,0,0,0.4)',
          }
        ]}
      >
        <View style={styles.feedHeader}>
          <View
            style={{ flex: 1, marginRight: 12 }}
            onLayout={(e) => setTabsContainerWidth(e.nativeEvent.layout.width)}
          >
            {!isSummarizeMode ? (
              <ScrollView
                ref={tabsScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.folderTabsScroll}
              >
                {/* All Tab */}
                <TouchableOpacity
                  style={styles.folderTab}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedFolderId(null);
                    scrollToTab("all");
                  }}
                  onLayout={(e) => {
                    const { x, width } = e.nativeEvent.layout;
                    setTabLayouts(prev => ({ ...prev, all: { x, width } }));
                  }}
                >
                  <Text style={[
                    styles.folderTabText,
                    selectedFolderId === null ? styles.folderTabTextActive : { color: Colors.textMuted }
                  ]}>
                    All
                  </Text>
                </TouchableOpacity>

                {/* Folder Tabs */}
                {folders.map(folder => {
                  const count = allTopics.filter(t => t.folderId === folder.id).length;
                  if (count === 0) return null;
                  const isActive = selectedFolderId === folder.id;
                  return (
                    <TouchableOpacity
                      key={folder.id}
                      style={styles.folderTab}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedFolderId(folder.id);
                        scrollToTab(folder.id);
                      }}
                      onLayout={(e) => {
                        const { x, width } = e.nativeEvent.layout;
                        setTabLayouts(prev => ({ ...prev, [folder.id]: { x, width } }));
                      }}
                    >
                      <Text style={[
                        styles.folderTabText,
                        isActive ? styles.folderTabTextActive : { color: Colors.textMuted }
                      ]}>
                        {folder.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={[styles.feedTitle, { color: Colors.text, fontSize: 13, fontFamily: "DMSans_500Medium", letterSpacing: 6, opacity: 0.9 }]}>
                {"  "}A I   S U M M A R Y
              </Text>
            )}
          </View>

          {/* Right: Streak + Summarize Toggle */}
          <View style={styles.feedHeaderRight}>
            {streak.currentStreak > 0 && (
              <TouchableOpacity
                onPress={() => router.push("/streak")}
                style={[styles.streakBadge, { backgroundColor: Colors.streak + "22", borderColor: Colors.streak + "44" }]}
              >
                <Ionicons name="flame" size={14} color={Colors.streak} />
                <Text style={[styles.streakText, { color: Colors.streak }]}>
                  {streak.currentStreak}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={toggleSummarize}
              activeOpacity={0.8}
              style={{
                marginLeft: 8,
                marginRight: 4,
              }}
            >
              <LivingAiIcon
                active={isSummarizeMode}
              />
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>

      <Animated.FlatList
        ref={flatListRef as any}
        data={displayedItems}
        keyExtractor={(item) => item.feedKey}
        contentContainerStyle={[styles.listContent, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
        snapToInterval={CARD_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        ListHeaderComponent={<View style={{ height: topPad + 62 }} />}
        // Only paginate on the All tab — folder view shows all items at once
        onEndReached={selectedFolderId === null && !isSummarizeMode ? loadMoreItems : undefined}
        onEndReachedThreshold={0.4}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
        ListFooterComponent={
          <FooterLoader loading={selectedFolderId === null && !isSummarizeMode && loadingMore} Colors={Colors} />
        }
        renderItem={({ item, index }) => (
          <FeedCard
            item={item}
            index={index}
            Colors={Colors}
            theme={theme}
            isMarked={!!markedTopics[getTopicKey(item.noteId, item.topicIndex)]}
            onToggleMark={() => toggleTopicMark(item.noteId, item.topicIndex)}
            onPress={() => navigateToTopic(item)}
            isGlass={isSummarizeMode}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  feedHeaderContainer: {
    zIndex: 5,
  },
  listContent: {
    paddingTop: 0,
  },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  feedTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    letterSpacing: 0.3,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  streakText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
  },
  searchToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    marginBottom: 12,
  },
  folderTabsScroll: {
    alignItems: "center",
    paddingHorizontal: 0,
  },
  folderTab: {
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  folderTabText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
  },
  folderTabTextActive: {
    color: "#FFFFFF",
    textShadowColor: "rgba(255, 255, 255, 0.85)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 4,
    gap: 10,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  heroBadgeText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  heroTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: 0.1,
  },
  heroBody: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 22,
  },
  heroFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
  },
  heroFooterText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
  },
  card: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  folderTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  folderDot: { width: 5, height: 5, borderRadius: 3 },
  folderTagText: { fontFamily: "DMSans_600SemiBold", fontSize: 11, letterSpacing: 0.3 },
  dueBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  dueText: { fontFamily: "DMSans_600SemiBold", fontSize: 10 },
  cardTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, lineHeight: 27, letterSpacing: 0.1 },
  cardPreview: { fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 22 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1 },
  cardBottomLeft: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  noteNameText: { fontFamily: "DMSans_400Regular", fontSize: 11, flex: 1 },
  readMoreBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  readMoreText: { fontFamily: "DMSans_600SemiBold", fontSize: 12 },
  footer: { paddingVertical: 20, alignItems: "center" },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
    marginTop: -40,
  },
  emptyTitle: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 22, marginTop: 8 },
  emptySubtitle: { fontFamily: "DMSans_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
  emptyButton: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 30 },
  emptyButtonText: { fontFamily: "DMSans_600SemiBold", fontSize: 16 },
  onboardingSteps: {
    width: '100%',
    gap: 20,
    marginBottom: 32,
  },
  onboardingStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    marginBottom: 4,
  },
  stepDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  storiesDrawerWrapper: {
    position: "absolute",
    right: -(SCREEN_WIDTH - 30),
    width: SCREEN_WIDTH - 30,
    height: 84,
    zIndex: 100,
    borderLeftWidth: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  drawerHandle: {
    position: "absolute",
    left: -30,
    top: -1,
    width: 31,
    height: 84,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRightWidth: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  drawerContentWrapper: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    paddingVertical: 10,
  },
  drawerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 14, paddingLeft: 10, marginBottom: 6 },
  drawerItem: { alignItems: "center", marginRight: 16, width: 60 },
  storyRingVertical: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  storyInnerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  drawerItemTextInside: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 9,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 11,
  },
});