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
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
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
    midnightGlass: "moon",
};

const THEME_COLORS: Record<ThemeName, string> = {
    darkBlue: "#7EB8F7",
    lightWarm: "#A67D45",
    midnightGlass: "#6366F1",
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
    const { exportData, importData, geminiApiKey, setGeminiApiKey, hapticsEnabled, setHapticsEnabled } = useNotes();
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
                title: "RVX | Notes Backup",
            });
        } catch (e) {
            Alert.alert("Export Failed", "Could not export data. Please try again.");
        }
    };

    const handleImport = () => {
        Alert.alert(
            "Import Data",
            "This will OVERWRITE all current data with your backup. Select your exported backup file to restore.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Select Backup File",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const result = await DocumentPicker.getDocumentAsync({
                                type: ["application/json", "text/plain"],
                                copyToCacheDirectory: true,
                            });

                            if (result.canceled || !result.assets || result.assets.length === 0) {
                                return;
                            }

                            const { uri } = result.assets[0];
                            let fileContent = "";

                            if (Platform.OS === "web") {
                                const response = await fetch(uri);
                                fileContent = await response.text();
                            } else {
                                fileContent = await FileSystem.readAsStringAsync(uri);
                            }

                            if (!fileContent || fileContent.trim().length === 0) {
                                Alert.alert("Empty File", "The selected file is empty.");
                                return;
                            }

                            // Validate JSON
                            const parsed = JSON.parse(fileContent);
                            if (!parsed.folders || !parsed.notes) {
                                Alert.alert("Invalid Backup", "The file content is not a valid RVX Notes backup.");
                                return;
                            }
                            await importData(fileContent);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert(
                                "Import Successful ✓",
                                `Restored ${parsed.folders?.length || 0} folders, ${parsed.notes?.length || 0} notes${parsed.markedTopics ? `, ${Object.keys(parsed.markedTopics).length} bookmarks` : ""}${parsed.topicCache ? ", AI cache" : ""}.`
                            );
                        } catch (e: any) {
                            Alert.alert("Import Failed", e?.message || "Invalid backup format. Make sure you selected the correct RVX backup file.");
                        }
                    },
                },
            ]
        );
    };

    const handleNotificationToggle = async (value: boolean) => {
        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (value) {
            const granted = await requestNotificationPermissions();
            if (granted) {
                await scheduleDailyReminder(8, 0);
                setNotificationsEnabled(true);
            } else {
                Alert.alert("Permission Denied", "Please enable notifications for RVX | Notes in your device settings.");
            }
        } else {
            await cancelAllReminders();
            setNotificationsEnabled(false);
        }
    };


    return (
        <View style={[styles.container, { paddingTop: topPad + 20, backgroundColor: Colors.background }]}>
            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingTop: 8, paddingBottom: 100 }]}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View entering={FadeIn.duration(400)}>
                    <Text style={[styles.headerTitle, { color: Colors.text }]}>Settings</Text>
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
                    <SectionHeader title="AI SUMMARY" Colors={Colors} />
                    <View style={[styles.group, { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }]}>
                        <View style={{ padding: 14, gap: 12 }}>
                            <View style={{ gap: 4 }}>
                                <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: Colors.text }}>AI Intelligence Levels</Text>
                                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: Colors.textMuted, lineHeight: 18 }}>
                                    RVX AI is powered by the Advanced Hybrid NLP Summarizer (v2.2) by default. This engine runs entirely on your device, ensuring your notes never leave your phone and requiring no internet, keys, or logins.
                                    {"\n\n"}
                                    For even deeper semantic analysis, you can upgrade to Pro AI Summary via Google Gemini.
                                </Text>
                            </View>

                            <View style={[styles.guideBox, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border }]}>
                                <Text style={[styles.guideTitle, { color: Colors.accent }]}>How to get your API Key:</Text>
                                <Text style={[styles.guideStep, { color: Colors.text }]}>1. Go to <Text style={{ color: Colors.accent, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}>Google AI Studio</Text></Text>
                                <Text style={[styles.guideStep, { color: Colors.text }]}>2. Sign in with your Google Account</Text>
                                <Text style={[styles.guideStep, { color: Colors.text }]}>3. Click &quot;Create API key in new project&quot;</Text>
                                <Text style={[styles.guideStep, { color: Colors.text }]}>4. Copy the key and paste it below</Text>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                <TextInput
                                    style={[{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 13, color: Colors.text, backgroundColor: Colors.surfaceElevated, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border }]}
                                    placeholder="Paste your Gemini API key here..."
                                    placeholderTextColor={Colors.textMuted}
                                    value={geminiKeyInput}
                                    onChangeText={setGeminiKeyInput}
                                    secureTextEntry
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                <TouchableOpacity
                                    style={{ backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10 }}
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
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={{ backgroundColor: Colors.accent + '20', padding: 6, borderRadius: 8 }}>
                                        <Ionicons name="sparkles" size={14} color={Colors.accent} />
                                    </View>
                                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: Colors.accent }}>
                                        Pro Intelligence Active
                                    </Text>
                                </View>
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={{ backgroundColor: Colors.textMuted + '15', padding: 6, borderRadius: 8 }}>
                                        <Ionicons name="shield-checkmark" size={14} color={Colors.textMuted} />
                                    </View>
                                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: Colors.textMuted }}>
                                        Standard On-Device Intelligence Active
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                </Animated.View>

                {/* Notifications */}
                <Animated.View entering={FadeInDown.delay(140)}>
                    <SectionHeader title="Notifications & Haptics" Colors={Colors} />
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
                        <SettingsRow
                            icon="hardware-chip-outline"
                            label="Haptic Feedback"
                            subtitle="Enable vibration on interactions"
                            Colors={Colors}
                            rightElement={
                                <Switch
                                    value={hapticsEnabled}
                                    onValueChange={(val) => {
                                        setHapticsEnabled(val);
                                        if (val) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }}
                                    trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
                                    thumbColor={hapticsEnabled ? Colors.accent : Colors.textMuted}
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

                {/* Connect */}
                <Animated.View entering={FadeInDown.delay(200)}>
                    <SectionHeader title="Connect" Colors={Colors} />
                    <View style={styles.group}>
                        <SettingsRow
                            icon="logo-linkedin"
                            label="LinkedIn"
                            subtitle="Connect with the Developer"
                            onPress={() => Linking.openURL('https://www.linkedin.com/in/varanasirahul/')}
                            Colors={Colors}
                        />
                    </View>
                </Animated.View>

                {/* About */}
                <Animated.View entering={FadeInDown.delay(220)}>
                    <SectionHeader title="About" Colors={Colors} />
                    <View style={[styles.aboutCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                        <Text style={[styles.aboutTitle, { color: Colors.text }]}>RVX NOTES</Text>
                        <Text style={[styles.aboutSubtitle, { color: Colors.textMuted }]}>
                            AI NOTES APPLICATION
                        </Text>
                        <View style={{ height: 12 }} />

                        <Text style={[styles.legalNotice, { color: Colors.textSecondary }]}>
                            © 2024–2026. The concepts, designs, and application &quot;RVX Notes&quot; are the exclusive intellectual property of Rahul Varanasi. This work is legally registered and protected by copyright law. Unauthorized reproduction, distribution, or imitation is strictly prohibited.
                        </Text>

                        <View style={{ height: 12 }} />
                        <Text style={[styles.aboutVersion, { color: Colors.textMuted }]}>Version 1.0</Text>
                        <Text style={[styles.aboutDeveloper, { color: Colors.textMuted }]}>
                            Owner & Developer: Rahul Varanasi
                        </Text>
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
    headerTitle: {
        fontFamily: "DMSans_500Medium",
        fontSize: 22,
        letterSpacing: 4,
        textTransform: 'uppercase',
        marginBottom: 8
    },
    sectionHeader: {
        fontFamily: "DMSans_500Medium",
        fontSize: 13,
        letterSpacing: 3,
        textTransform: 'uppercase',
        color: '#6366F1', // Use accent for section headers
        marginBottom: 12,
        marginLeft: 4
    },
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
    aboutTitle: { fontFamily: "DMSans_500Medium", fontSize: 20, letterSpacing: 6 },
    aboutSubtitle: { fontFamily: "DMSans_400Regular", fontSize: 13, textAlign: "center" },
    aboutVersion: { fontFamily: "DMSans_400Regular", fontSize: 12, marginTop: 4 },
    aboutDeveloper: { fontFamily: "DMSans_500Medium", fontSize: 12, marginTop: 2 },
    legalNotice: {
        fontFamily: "DMSans_400Regular",
        fontSize: 11,
        textAlign: "center",
        lineHeight: 18,
        paddingHorizontal: 12,
        opacity: 0.8
    },
    // Guide Box
    guideBox: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 6 },
    guideTitle: { fontFamily: "DMSans_700Bold", fontSize: 13, marginBottom: 2 },
    guideStep: { fontFamily: "DMSans_400Regular", fontSize: 12, lineHeight: 18 },
});
