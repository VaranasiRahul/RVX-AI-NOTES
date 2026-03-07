import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn, FadeInDown, useSharedValue, withSpring, withDelay,
  useAnimatedStyle, withSequence, withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useNotes } from "@/context/NotesContext";
import { useTheme } from "@/context/ThemeContext";

const MILESTONES = [3, 7, 14, 30, 60, 100];

function StatCard({ icon, label, value, color, Colors }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color: string;
  Colors: any;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: Colors.card, borderColor: color + "33" }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={[styles.statValue, { color: Colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: Colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function CalendarGrid({ history, Colors }: { history: string[]; Colors: any }) {
  const today = new Date();
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    days.push({ date: dateStr, label: d.getDate().toString(), revised: history.includes(dateStr), isToday: i === 0 });
  }
  return (
    <View style={styles.calendarGrid}>
      {days.map((day, i) => (
        <Animated.View
          key={day.date}
          entering={FadeIn.delay(i * 18)}
          style={[
            styles.calendarCell,
            { backgroundColor: Colors.surface, borderColor: Colors.border },
            day.revised && { backgroundColor: Colors.accent, borderColor: Colors.accent },
            day.isToday && !day.revised && { borderColor: Colors.accent, borderWidth: 1.5 },
          ]}
        >
          <Text style={[
            styles.calendarCellText,
            { color: Colors.textMuted },
            day.revised && { color: Colors.background, fontFamily: "DMSans_600SemiBold" },
            day.isToday && !day.revised && { color: Colors.accent, fontFamily: "DMSans_600SemiBold" },
          ]}>
            {day.label}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}

function WeekBarChart({ dailyReviewCounts, Colors }: { dailyReviewCounts: Record<string, number>; Colors: any }) {
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const count = dailyReviewCounts[dateStr] || 0;
    const label = d.toLocaleDateString("en", { weekday: "short" }).slice(0, 1);
    days.push({ dateStr, count, label, isToday: i === 0 });
  }
  const maxCount = Math.max(...days.map((d) => d.count), 1);

  return (
    <View style={[styles.barChartContainer, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
      <Text style={[styles.barChartTitle, { color: Colors.textMuted }]}>TOPICS REVIEWED — LAST 7 DAYS</Text>
      <View style={styles.barChartRow}>
        {days.map((day) => {
          const heightPct = day.count / maxCount;
          return (
            <View key={day.dateStr} style={styles.barCol}>
              <Text style={[styles.barCount, { color: day.count > 0 ? Colors.accent : Colors.textMuted }]}>
                {day.count > 0 ? day.count : ""}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: Colors.surface }]}>
                <Animated.View
                  entering={FadeInDown.delay(100).springify()}
                  style={[
                    styles.barFill,
                    {
                      height: `${Math.max(heightPct * 100, day.count > 0 ? 8 : 0)}%`,
                      backgroundColor: day.isToday ? Colors.accent : Colors.accent + "66",
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: day.isToday ? Colors.accent : Colors.textMuted }]}>
                {day.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MilestoneCard({ streak, Colors }: { streak: number; Colors: any }) {
  const nextMilestone = MILESTONES.find((m) => m > streak);
  const lastMilestone = [...MILESTONES].reverse().find((m) => m <= streak);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (lastMilestone && streak === lastMilestone) {
      scale.value = withSequence(
        withTiming(1.08, { duration: 180 }),
        withSpring(1, { damping: 6 }),
      );
    }
  }, [streak]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (!nextMilestone && !lastMilestone) return null;

  const progress = lastMilestone
    ? Math.min((streak - (MILESTONES[MILESTONES.indexOf(lastMilestone) - 1] || 0)) /
      (lastMilestone - (MILESTONES[MILESTONES.indexOf(lastMilestone) - 1] || 0)), 1)
    : streak / (nextMilestone || 3);

  return (
    <Animated.View style={[styles.milestoneCard, animStyle, { backgroundColor: Colors.card, borderColor: Colors.accent + "40" }]}>
      <View style={styles.milestoneTop}>
        <Ionicons name="trophy-outline" size={20} color={Colors.accent} />
        <Text style={[styles.milestoneTitle, { color: Colors.text }]}>
          {lastMilestone && streak >= lastMilestone ? `🎉 ${lastMilestone}-Day Milestone Reached!` : `Next milestone: ${nextMilestone} days`}
        </Text>
      </View>
      {nextMilestone && (
        <>
          <View style={[styles.progressTrack, { backgroundColor: Colors.surface }]}>
            <Animated.View
              entering={FadeIn.delay(300)}
              style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: Colors.accent }]}
            />
          </View>
          <Text style={[styles.milestoneSubtitle, { color: Colors.textMuted }]}>
            {streak} / {nextMilestone} days · {nextMilestone - streak} to go
          </Text>
        </>
      )}
    </Animated.View>
  );
}

function MotivationMessage({ streak, Colors }: { streak: number; Colors: any }) {
  let message = "Start your revision journey today!";
  let icon: keyof typeof Ionicons.glyphMap = "sparkles";
  if (streak >= 30) { message = "Incredible! 30+ days of dedication!"; icon = "trophy"; }
  else if (streak >= 14) { message = "Two weeks strong — you're unstoppable!"; icon = "ribbon"; }
  else if (streak >= 7) { message = "One full week! Your brain thanks you."; icon = "star"; }
  else if (streak >= 3) { message = "3 days in — a habit is forming!"; icon = "leaf"; }
  else if (streak >= 1) { message = "Great start! Keep the momentum going."; icon = "flash"; }
  return (
    <View style={[styles.motivationCard, { backgroundColor: Colors.accent + "15", borderColor: Colors.accent + "33" }]}>
      <Ionicons name={icon} size={28} color={Colors.accent} />
      <Text style={[styles.motivationText, { color: Colors.accent }]}>{message}</Text>
    </View>
  );
}

export default function StreakScreen() {
  const insets = useSafeAreaInsets();
  const { streak, notes, folders } = useNotes();
  const { colors: Colors } = useTheme();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const totalTopics = notes.reduce((acc, note) => {
    const sections = note.content.split(/\n{3,}/).filter((s) => s.trim().length > 0);
    return acc + sections.length;
  }, 0);

  const today = new Date().toISOString().split("T")[0];
  const todayReviews = streak.dailyReviewCounts?.[today] || 0;
  const totalRevisions = streak.history.length;

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100, paddingTop: topPad + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Plain header — no BlurView */}
        <Animated.View entering={FadeIn.duration(400)} style={{ marginBottom: 20 }}>
          <Text style={[styles.headerTitle, { color: Colors.text }]}>Streak</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)} style={[styles.mainStreakCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
          <View style={styles.flameRow}>
            <Ionicons name="flame" size={48} color={streak.currentStreak > 0 ? Colors.streak : Colors.textMuted} />
            <Text style={[styles.streakNumber, { color: streak.currentStreak > 0 ? Colors.streak : Colors.textMuted }]}>
              {streak.currentStreak}
            </Text>
          </View>
          <Text style={[styles.streakLabel, { color: Colors.textSecondary }]}>Day Streak</Text>
          <MotivationMessage streak={streak.currentStreak} Colors={Colors} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(130)}>
          <MilestoneCard streak={streak.currentStreak} Colors={Colors} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200)} style={styles.statsRow}>
          <StatCard icon="trophy" label="Best Streak" value={`${streak.longestStreak}d`} color={Colors.accent} Colors={Colors} />
          <StatCard icon="checkmark-circle" label="Days Revised" value={totalRevisions} color={Colors.success} Colors={Colors} />
          <StatCard icon="today-outline" label="Today's Reviews" value={todayReviews} color={Colors.warning} Colors={Colors} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(260)}>
          <WeekBarChart dailyReviewCounts={streak.dailyReviewCounts || {}} Colors={Colors} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.text }]}>Last 28 Days</Text>
          <CalendarGrid history={streak.history} Colors={Colors} />
          <View style={styles.legend}>
            {[{ label: "Revised", color: Colors.accent }, { label: "Missed", color: Colors.border }, { label: "Today", color: Colors.accent + "55" }].map(({ label, color }) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }, label === "Today" && { borderWidth: 1.5, borderColor: Colors.accent }]} />
                <Text style={[styles.legendText, { color: Colors.textMuted }]}>{label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.text }]}>Library Overview</Text>
          <View style={[styles.overviewRow, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            {[["Folders", folders.length], ["Notes", notes.length], ["Topics", totalTopics]].map(([label, value], i) => (
              <React.Fragment key={label as string}>
                {i > 0 && <View style={[styles.overviewDivider, { backgroundColor: Colors.border }]} />}
                <View style={styles.overviewItem}>
                  <Text style={[styles.overviewNumber, { color: Colors.text }]}>{value}</Text>
                  <Text style={[styles.overviewLabel, { color: Colors.textMuted }]}>{label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, gap: 20 },
  headerTitle: {
    fontFamily: "DMSans_500Medium",
    fontSize: 22,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  mainStreakCard: { borderRadius: 24, padding: 28, alignItems: "center", borderWidth: 1, gap: 8 },
  flameRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  streakNumber: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 64, lineHeight: 68 },
  streakLabel: { fontFamily: "DMSans_400Regular", fontSize: 16, letterSpacing: 2, textTransform: "uppercase" },
  motivationCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginTop: 8, borderWidth: 1 },
  motivationText: { fontFamily: "DMSans_500Medium", fontSize: 13, flex: 1 },
  milestoneCard: { borderRadius: 16, padding: 16, gap: 10, borderWidth: 1 },
  milestoneTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  milestoneTitle: { fontFamily: "DMSans_600SemiBold", fontSize: 14, flex: 1 },
  milestoneSubtitle: { fontFamily: "DMSans_400Regular", fontSize: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  statsRow: { flexDirection: "row", gap: 12 },
  statCard: { flex: 1, borderRadius: 16, padding: 16, alignItems: "center", gap: 6, borderWidth: 1 },
  statIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statValue: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20 },
  statLabel: { fontFamily: "DMSans_400Regular", fontSize: 11, textAlign: "center" },
  barChartContainer: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  barChartTitle: { fontFamily: "DMSans_600SemiBold", fontSize: 10, letterSpacing: 0.8, textAlign: "center" },
  barChartRow: { flexDirection: "row", alignItems: "flex-end", height: 80, gap: 6 },
  barCol: { flex: 1, alignItems: "center", gap: 4, height: "100%" },
  barCount: { fontFamily: "DMSans_600SemiBold", fontSize: 10 },
  barTrack: { flex: 1, width: "100%", borderRadius: 4, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 4 },
  barLabel: { fontFamily: "DMSans_500Medium", fontSize: 11 },
  section: { gap: 14 },
  sectionTitle: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
    opacity: 0.7
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  calendarCell: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  calendarCellText: { fontFamily: "DMSans_400Regular", fontSize: 12 },
  legend: { flexDirection: "row", gap: 16, paddingLeft: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: "DMSans_400Regular", fontSize: 12 },
  overviewRow: { flexDirection: "row", borderRadius: 16, borderWidth: 1, padding: 20 },
  overviewItem: { flex: 1, alignItems: "center", gap: 4 },
  overviewDivider: { width: 1 },
  overviewNumber: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 28 },
  overviewLabel: { fontFamily: "DMSans_400Regular", fontSize: 13 },
});