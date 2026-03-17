import * as Haptics from 'expo-haptics';
import { useNotes } from '../context/NotesContext';

export function useHaptics() {
    const { hapticsEnabled } = useNotes();

    const triggerHaptic = async (style = Haptics.ImpactFeedbackStyle.Light) => {
        if (hapticsEnabled) {
            await Haptics.impactAsync(style);
        }
    };

    const triggerNotification = async (type = Haptics.NotificationFeedbackType.Success) => {
        if (hapticsEnabled) {
            await Haptics.notificationAsync(type);
        }
    };

    const triggerSelection = async () => {
        if (hapticsEnabled) {
            await Haptics.selectionAsync();
        }
    };

    return {
        triggerHaptic,
        triggerNotification,
        triggerSelection
    };
}
