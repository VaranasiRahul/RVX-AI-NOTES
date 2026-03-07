import { NativeModules, Platform } from 'react-native';

const { WidgetModule } = NativeModules;

export interface WidgetPickData {
    title: string;
    folder: string;
    color: string;
}

export const WidgetManager = {
    updateStreak: (streak: number) => {
        if (Platform.OS !== 'android' || !WidgetModule) return;
        WidgetModule.updateStreak(streak);
    },

    updatePick: (data: WidgetPickData) => {
        if (Platform.OS !== 'android' || !WidgetModule) return;
        WidgetModule.updatePick(data.title, data.folder, data.color);
    }
};
