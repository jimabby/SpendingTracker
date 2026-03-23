import React, { createContext, useContext, useMemo } from 'react';
import { useApp } from './AppContext';
import { createTheme, AppTheme, theme as defaultTheme } from '../constants/theme';

const ThemeContext = createContext<AppTheme>(defaultTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { state } = useApp();
  const theme = useMemo(() => createTheme(state.darkMode), [state.darkMode]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}
