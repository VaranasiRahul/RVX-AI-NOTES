import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Platform,
    TouchableOpacity,
    Alert,
    Share,
    Switch,
    TextInput,
    Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useNotes } from "@/context/NotesContext";
import { useTheme, ThemeName } from "@/context/ThemeContext";
import {
    requestNotificationPermissions,
    scheduleDailyReminder,
    cancelAllReminders,
    getScheduledReminders,
} from "@/lib/notifications";

const THEME_ICONS: Record<ThemeName, keyof typeof Ionicons.glyphMap> = {
    darkBlue: "planet",
    lightWarm: "sunny",
};

const THEME_COLORS: Record<ThemeName, string> = {
    darkBlue: "#7EB8F7",
    lightWarm: "#A67D45",
};

function SectionHeader({ title, Colors }: { title: string; Colors: any }) {
    return (
        <Text style={[styles.sectionHeader, { color: Colors.textMuted }]}>{title.toUpperCase()}</Text>
    );
}

function SettingsRow({ icon, label, subtitle, onPress, rightElement, Colors, danger }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    Colors: any;
    danger?: boolean;
}) {
    return (
        <TouchableOpacity
            style={[styles.row, { backgroundColor: Colors.card, borderColor: Colors.border }]}
            onPress={onPress}
            activeOpacity={onPress ? 0.7 : 1}
            disabled={!onPress && !rightElement}
        >
            <View style={[styles.rowIcon, { backgroundColor: (danger ? Colors.error : Colors.accent) + "20" }]}>
                <Ionicons name={icon} size={20} color={danger ? Colors.error : Colors.accent} />
            </View>
            <View style={styles.rowContent}>
                <Text style={[styles.rowLabel, { color: danger ? Colors.error : Colors.text }]}>{label}</Text>
                {subtitle ? <Text style={[styles.rowSubtitle, { color: Colors.textMuted }]}>{subtitle}</Text> : null}
            </View>
            {rightElement || (onPress ? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} /> : null)}
        </TouchableOpacity>
    );
}

export default function SettingsScreen() {
    const insets = useSafeAreaInsets();
    const { exportData, importData, notes, folders, streak, topicProgress, geminiApiKey, setGeminiApiKey } = useNotes();
    const { colors: Colors, theme, setTheme, themeLabels, themeNames } = useTheme();
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [geminiKeyInput, setGeminiKeyInput] = useState(geminiApiKey);
    const [geminiSaved, setGeminiSaved] = useState(false);

    const topPad = Platform.OS === "web" ? 67 : insets.top;

    useEffect(() => {
        if (Platform.OS !== "web") {
            getScheduledReminders().then((reminders) => {
                setNotificationsEnabled(reminders.length > 0);
            });
        }
    }, []);

    const handleExport = async () => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const json = await exportData();
            await Share.share({
                message: json,
                title: "ReviseIt Backup",
            });
        } catch (e) {
            Alert.alert("Export Failed", "Could not export data. Please try again.");
        }
    };

    const handleImport = () => {
        Alert.alert(
            "Import Data",
            "Paste your exported JSON to restore your data. This will OVERWRITE all current data. Are you sure?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Open Clipboard Import",
                    onPress: async () => {
                        Alert.alert(
                            "Import via Clipboard",
                            "Copy your ReviseIt JSON backup to clipboard, then press Import.",
                            [
                                { text: "Cancel", style: "cancel" },
                                {
                                    text: "Import",
                                    onPress: async () => {
                                        try {
                                            // In a real scenario, use Clipboard.getStringAsync()
                                            // For now, show instructions
                                            Alert.alert("How to Import", "Export your data from another device, copy the JSON text, then paste it here. Full clipboard support can be added via expo-clipboard.");
                                        } catch {
                                            Alert.alert("Import Failed", "Invalid backup format.");
                                        }
                                    },
                                },
                            ]
                        );
                    },
                },
            ]
        );
    };

    const handleNotificationToggle = async (value: boolean) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (value) {
            const granted = await requestNotificationPermissions();
            if (granted) {
                await scheduleDailyReminder(8, 0);
                setNotificationsEnabled(true);
            } else {
                Alert.alert("Permission Denied", "Please enable notifications for ReviseIt in your device settings.");
            }
        } else {
            await cancelAllReminders();
            setNotificationsEnabled(false);
        }
    };

    const totalTopics = notes.reduce((acc, note) => {
        return acc + note.content.split(/\n{3,}/).filter(s => s.trim()).length;
    }, 0);

    const ratedTopics = Object.keys(topicProgress).length;

    return (
        <View style={[styles.container, { paddingTop: topPad, backgroundColor: Colors.background }]}>
            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === "web" ? 100 : 100 }]}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View entering={FadeIn.duration(400)}>
                    <Text style={[styles.headerTitle, { color: Colors.text }]}>Settings</Text>
                </Animated.View>

                {/* Stats overview */}
                <Animated.View entering={FadeInDown.delay(80)} style={[styles.statsCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                    {[
                        { label: "Folders", value: folders.length, icon: "folder-outline" },
                        { label: "Notes", value: notes.length, icon: "document-text-outline" },
                        { label: "Topics", value: totalTopics, icon: "list-outline" },
                        { label: "Rated", value: ratedTopics, icon: "star-outline" },
                    ].map(({ label, value, icon }, i) => (
                        <React.Fragment key={label}>
                            {i > 0 && <View style={[styles.statsDivider, { backgroundColor: Colors.border }]} />}
                            <View style={styles.statsItem}>
                                <Ionicons name={icon as any} size={16} color={Colors.accent} />
                                <Text style={[styles.statsValue, { color: Colors.text }]}>{value}</Text>
                                <Text style={[styles.statsLabel, { color: Colors.textMuted }]}>{label}</Text>
                            </View>
                        </React.Fragment>
                    ))}
                </Animated.View>

                {/* Theme */}
                <Animated.View entering={FadeInDown.delay(100)}>
                    <SectionHeader title="Appearance" Colors={Colors} />
                    <View style={styles.themeGrid}>
                        {themeNames.map((t) => (
                            <TouchableOpacity
                                key={t}
                                style={[
                                    styles.themeCard,
                                    { backgroundColor: Colors.card, borderColor: theme === t ? THEME_COLORS[t] : Colors.border },
                                    theme === t && { borderWidth: 2 },
                                ]}
                                onPress={() => { Haptics.selectionAsync(); setTheme(t); }}
                                activeOpacity={0.75}
                            >
                                <View style={[styles.themeIconWrap, { backgroundColor: THEME_COLORS[t] + "22" }]}>
                                    <Ionicons name={THEME_ICONS[t]} size={22} color={THEME_COLORS[t]} />
                                </View>
                                <Text style={[styles.themeLabel, { color: Colors.text }]}>{themeLabels[t]}</Text>
                                {theme === t && (
                                    <View style={[styles.themeCheck, { backgroundColor: THEME_COLORS[t] }]}>
                                        <Ionicons name="checkmark" size={10} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </Animated.View>

                {/* AI Features */}
                <Animated.View entering={FadeInDown.delay(120)}>
                    <SectionHeader title="AI Topic Analysis" Colors={Colors} />
                    <View style={[styles.group, { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }]}>
                        <View style={{ padding: 14, gap: 10 }}>
                            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: Colors.textMuted, lineHeight: 18 }}>
                                Enter your free Gemini API key to enable intelligent topic separation. Get one at{' '}
                                <Text style={{ color: Colors.accent, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}>
                                    aistudio.google.com
                                </Text>
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                <TextInput
                                    style={[{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 13, color: Colors.text, backgroundColor: Colors.surfaceElevated, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border }]}
                                    placeholder="AIza..."
                                    placeholderTextColor={Colors.textMuted}
                                    value={geminiKeyInput}
                                    onChangeText={setGeminiKeyInput}
                                    secureTextEntry
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                <TouchableOpacity
                                    style={{ backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 }}
                                    onPress={async () => {
                                        await setGeminiApiKey(geminiKeyInput);
                                        setGeminiSaved(true);
                                        setTimeout(() => setGeminiSaved(false), 2000);
                                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                    }}
                                >
                                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: Colors.background }}>
                                        {geminiSaved ? 'Saved ✓' : 'Save'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            {geminiApiKey ? (
                                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: Colors.accent }}>
                                    ✦ AI active — tap the sparkles button in any note to analyze topics
                                </Text>
                            ) : (
                                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: Colors.textMuted }}>
                                    Without a key, notes use basic topic splitting instead of AI
                                </Text>
                            )}
                        </View>
                    </View>
                </Animated.View>

                {/* Notifications */}
                <Animated.View entering={FadeInDown.delay(140)}>
                    <SectionHeader title="Notifications" Colors={Colors} />
                    <View style={styles.group}>
                        <SettingsRow
                            icon="notifications-outline"
                            label="Daily Reminder"
                            subtitle="Reminds you to revise at 8:00 AM"
                            Colors={Colors}
                            rightElement={
                                <Switch
                                    value={notificationsEnabled}
                                    onValueChange={handleNotificationToggle}
                                    trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
                                    thumbColor={notificationsEnabled ? Colors.accent : Colors.textMuted}
                                />
                            }
                        />
                    </View>
                </Animated.View>

                {/* Backup */}
                <Animated.View entering={FadeInDown.delay(180)}>
                    <SectionHeader title="Backup & Restore" Colors={Colors} />
                    <View style={styles.group}>
                        <SettingsRow
                            icon="cloud-upload-outline"
                            label="Export Data"
                            subtitle="Share all notes, folders & progress as JSON"
                            onPress={handleExport}
                            Colors={Colors}
                        />
                        <SettingsRow
                            icon="cloud-download-outline"
                            label="Import Backup"
                            subtitle="Restore from a previous JSON export"
                            onPress={handleImport}
                            Colors={Colors}
                        />
                    </View>
                </Animated.View>

                {/* About */}
                <Animated.View entering={FadeInDown.delay(220)}>
                    <SectionHeader title="About" Colors={Colors} />
                    <View style={[styles.aboutCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                        <Ionicons name="book" size={32} color={Colors.accent} />
                        <Text style={[styles.aboutTitle, { color: Colors.text }]}>ReviseIt</Text>
                        <Text style={[styles.aboutSubtitle, { color: Colors.textMuted }]}>
                            Notes revision with spaced repetition
                        </Text>
                        <Text style={[styles.aboutVersion, { color: Colors.textMuted }]}>Version 2.0</Text>
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
    headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 28, marginBottom: 4 },
    sectionHeader: { fontFamily: "DMSans_600SemiBold", fontSize: 11, letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
    // Stats
    statsCard: { flexDirection: "row", borderRadius: 16, padding: 16, borderWidth: 1 },
    statsItem: { flex: 1, alignItems: "center", gap: 3 },
    statsDivider: { width: 1 },
    statsValue: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20 },
    statsLabel: { fontFamily: "DMSans_400Regular", fontSize: 11 },
    // Theme
    themeGrid: { flexDirection: "row", gap: 10 },
    themeCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", gap: 8, borderWidth: 1, position: "relative" },
    themeIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    themeLabel: { fontFamily: "DMSans_500Medium", fontSize: 11, textAlign: "center" },
    themeCheck: { position: "absolute", top: 8, right: 8, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    // Rows
    group: { gap: 2 },
    row: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 12, marginBottom: 2 },
    rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    rowContent: { flex: 1 },
    rowLabel: { fontFamily: "DMSans_600SemiBold", fontSize: 15 },
    rowSubtitle: { fontFamily: "DMSans_400Regular", fontSize: 12, marginTop: 1 },
    // About
    aboutCard: { borderRadius: 16, padding: 24, alignItems: "center", borderWidth: 1, gap: 6 },
    aboutTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22 },
    aboutSubtitle: { fontFamily: "DMSans_400Regular", fontSize: 13, textAlign: "center" },
    aboutVersion: { fontFamily: "DMSans_400Regular", fontSize: 12, marginTop: 4 },
});
