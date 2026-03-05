export interface ColorPalette {
  background: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  border: string;
  borderLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  accentDark: string;
  success: string;
  error: string;
  warning: string;
  streak: string;
  light: {
    tint: string;
    tabIconDefault: string;
    tabIconSelected: string;
  };
}


export const DarkBlueColors: ColorPalette = {
  background: '#0D0F18',
  surface: '#141826',
  surfaceElevated: '#1C2230',
  card: '#181E2E',
  border: '#252D42',
  borderLight: '#303B54',
  text: '#E8EAF5',
  textSecondary: '#8A90A8',
  textMuted: '#4A5068',
  accent: '#7EB8F7',
  accentLight: '#A8D0FF',
  accentDark: '#5490D0',
  success: '#6BBF8E',
  error: '#E07070',
  warning: '#E8B84B',
  streak: '#FF8C42',
  light: {
    tint: '#7EB8F7',
    tabIconDefault: '#4A5068',
    tabIconSelected: '#7EB8F7',
  },
};

export const LightWarmColors: ColorPalette = {
  background: '#FAF7F2',
  surface: '#F2EDE4',
  surfaceElevated: '#E8E0D2',
  card: '#FFFFFF',
  border: '#DDD6C8',
  borderLight: '#EDE8DE',
  text: '#2C2420',
  textSecondary: '#6B5E54',
  textMuted: '#A09288',
  accent: '#A67D45',
  accentLight: '#C49A5E',
  accentDark: '#7A5C30',
  success: '#3A8A5E',
  error: '#C04040',
  warning: '#C08830',
  streak: '#D46020',
  light: {
    tint: '#A67D45',
    tabIconDefault: '#A09288',
    tabIconSelected: '#A67D45',
  },
};

// Default export — used by files not yet migrated to ThemeContext
const Colors = DarkBlueColors;
export default Colors;
