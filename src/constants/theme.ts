export const lightColors = {
  background: '#F3F5FB',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1FA',
  border: '#DEE4F0',
  text: '#1F2937',
  textMuted: '#6B7280',
  textFaint: '#94A3B8',
  primary: '#5B6CFF',
  primaryDark: '#4354E6',
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
};

export const darkColors = {
  background: '#0F1117',
  surface: '#1A1D27',
  surfaceMuted: '#252836',
  border: '#2E3345',
  text: '#E5E7EB',
  textMuted: '#9CA3AF',
  textFaint: '#6B7280',
  primary: '#7C8AFF',
  primaryDark: '#5B6CFF',
  success: '#34D399',
  danger: '#F87171',
  warning: '#FBBF24',
};

export type ThemeColors = typeof lightColors;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const lightShadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;

export const darkShadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export type ThemeShadow = {
  card: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
};

export interface AppTheme {
  colors: ThemeColors;
  radius: typeof radius;
  shadow: ThemeShadow;
}

export function createTheme(dark: boolean): AppTheme {
  return {
    colors: dark ? darkColors : lightColors,
    radius,
    shadow: dark ? darkShadow : lightShadow,
  };
}

// Default light theme for backward compat (used as fallback)
export const theme = createTheme(false);
