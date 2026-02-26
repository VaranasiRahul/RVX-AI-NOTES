import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useNotes } from "@/context/NotesContext";
import Colors from "@/constants/colors";

function StatCard({ icon, label, value, color }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: color + '33' }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CalendarGrid({ history }: { history: string[] }) {
  const today = new Date();
  const days: { date: string; label: string; revised: boolean; isToday: boolean; isFuture: boolean }[] = [];

  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const isTodayFlag = i === 0;
    days.push({
      date: dateStr,
      label: d.getDate().toString(),
      revised: history.includes(dateStr),
      isToday: isTodayFlag,
      isFuture: false,
    });
  }

  return (
    <View style={styles.calendarGrid}>
      {days.map((day, i) => (
        <Animated.View
          key={day.date}
          entering={FadeIn.delay(i * 20)}
          style={[
            styles.calendarCell,
            day.revised && styles.calendarCellRevised,
            day.isToday && styles.calendarCellToday,
          ]}
        >
          <Text style={[
            styles.calendarCellText,
            day.revised && styles.calendarCellTextRevised,
            day.isToday && styles.calendarCellTextToday,
          ]}>
            {day.label}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}

function MotivationMessage({ streak }: { streak: number }) {
  let message = "Start your revision journey today!";
  let icon: keyof typeof Ionicons.glyphMap = "sparkles";

  if (streak >= 30) {
    message = "Incredible! 30+ days of dedication!";
    icon = "trophy";
  } else if (streak >= 14) {
    message = "Two weeks strong — you're unstoppable!";
    icon = "ribbon";
  } else if (streak >= 7) {
    message = "One full week! Your brain thanks you.";
    icon = "star";
  } else if (streak >= 3) {
    message = "3 days in — a habit is forming!";
    icon = "leaf";
  } else if (streak >= 1) {
    message = "Great start! Keep the momentum going.";
    icon = "flash";
  }

  return (
    <View style={styles.motivationCard}>
      <Ionicons name={icon} size={28} color={Colors.accent} />
      <Text style={styles.motivationText}>{message}</Text>
    </View>
  );
}

export default function StreakScreen() {
  const insets = useSafeAreaInsets();
  const { streak, notes, folders } = useNotes();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const totalTopics = notes.reduce((acc, note) => {
    const sections = note.content.split(/\n{3,}/).filter(s => s.trim().length > 0);
    return acc + sections.length;
  }, 0);

  const totalRevisions = streak.history.length;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 100 : 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)}>
          <Text style={styles.headerTitle}>Streak</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)} style={styles.mainStreakCard}>
          <View style={styles.flameRow}>
            <Text style={styles.flameEmoji}>
              <Ionicons name="flame" size={48} color={streak.currentStreak > 0 ? Colors.streak : Colors.textMuted} />
            </Text>
            <Text style={[styles.streakNumber, streak.currentStreak === 0 && styles.streakNumberZero]}>
              {streak.currentStreak}
            </Text>
          </View>
          <Text style={styles.streakLabel}>Day Streak</Text>
          <MotivationMessage streak={streak.currentStreak} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200)} style={styles.statsRow}>
          <StatCard
            icon="trophy"
            label="Best Streak"
            value={`${streak.longestStreak}d`}
            color={Colors.accent}
          />
          <StatCard
            icon="checkmark-circle"
            label="Total Revised"
            value={totalRevisions}
            color={Colors.success}
          />
          <StatCard
            icon="library"
            label="Total Topics"
            value={totalTopics}
            color="#7AABCF"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <Text style={styles.sectionTitle}>Last 28 Days</Text>
          <CalendarGrid history={streak.history} />
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
              <Text style={styles.legendText}>Revised</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.border }]} />
              <Text style={styles.legendText}>Missed</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.accent + '55', borderWidth: 1.5, borderColor: Colors.accent }]} />
              <Text style={styles.legendText}>Today</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
          <Text style={styles.sectionTitle}>Library Overview</Text>
          <View style={styles.overviewRow}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewNumber}>{folders.length}</Text>
              <Text style={styles.overviewLabel}>Folders</Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewItem}>
              <Text style={styles.overviewNumber}>{notes.length}</Text>
              <Text style={styles.overviewLabel}>Notes</Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewItem}>
              <Text style={styles.overviewNumber}>{totalTopics}</Text>
              <Text style={styles.overviewLabel}>Topics</Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 20,
  },
  headerTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    color: Colors.text,
    marginBottom: 4,
  },
  mainStreakCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  flameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  flameEmoji: {
    fontSize: 48,
  },
  streakNumber: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 64,
    color: Colors.streak,
    lineHeight: 68,
  },
  streakNumberZero: {
    color: Colors.textMuted,
  },
  streakLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    color: Colors.textSecondary,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  motivationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.accent + '15',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.accent + '33',
  },
  motivationText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: Colors.accent,
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    fontFamily: "PlayfairDisplay_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  calendarCell: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarCellRevised: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  calendarCellToday: {
    borderColor: Colors.accent,
    borderWidth: 1.5,
  },
  calendarCellText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  calendarCellTextRevised: {
    color: Colors.background,
    fontFamily: "DMSans_600SemiBold",
  },
  calendarCellTextToday: {
    color: Colors.accent,
    fontFamily: "DMSans_600SemiBold",
  },
  legend: {
    flexDirection: "row",
    gap: 16,
    paddingLeft: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  overviewRow: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  overviewItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  overviewDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  overviewNumber: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  overviewLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
});
