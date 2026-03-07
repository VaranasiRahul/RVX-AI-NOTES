import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorPalette, DarkBlueColors, LightWarmColors, MidnightGlassColors } from '@/constants/colors';

export type ThemeName = 'darkBlue' | 'lightWarm' | 'midnightGlass';

const THEME_PALETTES: Record<ThemeName, ColorPalette> = {
    darkBlue: DarkBlueColors,
    lightWarm: LightWarmColors,
    midnightGlass: MidnightGlassColors,
};

const THEME_LABELS: Record<ThemeName, string> = {
    darkBlue: 'Dark Blue',
    lightWarm: 'Light Warm',
    midnightGlass: 'Midnight Glass',
};

const THEME_STORAGE_KEY = 'reviseit_theme';

interface ThemeContextValue {
    theme: ThemeName;
    colors: ColorPalette;
    setTheme: (theme: ThemeName) => Promise<void>;
    themeLabels: typeof THEME_LABELS;
    themeNames: ThemeName[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeName>('darkBlue');

    useEffect(() => {
        AsyncStorage.getItem(THEME_STORAGE_KEY).then(stored => {
            if (stored && stored in THEME_PALETTES) {
                setThemeState(stored as ThemeName);
            }
        });
    }, []);

    const setTheme = async (newTheme: ThemeName) => {
        setThemeState(newTheme);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    };

    const value = useMemo<ThemeContextValue>(() => ({
        theme,
        colors: THEME_PALETTES[theme],
        setTheme,
        themeLabels: THEME_LABELS,
        themeNames: Object.keys(THEME_PALETTES) as ThemeName[],
    }), [theme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
