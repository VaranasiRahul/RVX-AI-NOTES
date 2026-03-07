import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}

export async function scheduleDailyReminder(hour = 8, minute = 0): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
        // Cancel any existing reminders first
        await Notifications.cancelAllScheduledNotificationsAsync();

        await Notifications.scheduleNotificationAsync({
            content: {
                title: '📚 Time to revise!',
                body: "Your streak is waiting 🔥 Open ReviseIt and explore today's topics.",
                sound: false,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour,
                minute,
            },
        });
    } catch (e) {
        console.warn('Failed to schedule notification:', e);
    }
}

export async function cancelAllReminders(): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getScheduledReminders() {
    if (Platform.OS === 'web') return [];
    return Notifications.getAllScheduledNotificationsAsync();
}
