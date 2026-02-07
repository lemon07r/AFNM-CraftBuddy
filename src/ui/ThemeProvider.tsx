/**
 * CraftBuddy - Theme Provider
 *
 * Wraps the application with MUI theme.
 * Lightweight wrapper that doesn't add unnecessary re-renders.
 */

import React, { memo } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { craftBuddyTheme } from './theme';

interface CraftBuddyThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Theme provider for CraftBuddy UI components.
 * Memoized to prevent unnecessary re-renders.
 */
export const CraftBuddyThemeProvider = memo(function CraftBuddyThemeProvider({
  children,
}: CraftBuddyThemeProviderProps) {
  return (
    <MuiThemeProvider theme={craftBuddyTheme}>{children}</MuiThemeProvider>
  );
});

export default CraftBuddyThemeProvider;
