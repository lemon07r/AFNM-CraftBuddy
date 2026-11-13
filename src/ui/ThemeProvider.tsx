/**
 * CraftBuddy - Theme Provider
 *
 * Wraps CraftBuddy UI with its MUI theme, registers the bundled fonts and
 * publishes the text-size preference as a CSS variable.
 */

import React, { memo, useEffect, useSyncExternalStore } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material';
import { getSettings, subscribeSettings } from '../settings';
import { ensureCraftBuddyFonts } from './fonts';
import { craftBuddyTheme, TEXT_SCALE_VAR } from './theme';

interface CraftBuddyThemeProviderProps {
  children: React.ReactNode;
}

const getTextScale = () => getSettings().uiTextScale;

export const CraftBuddyThemeProvider = memo(function CraftBuddyThemeProvider({
  children,
}: CraftBuddyThemeProviderProps) {
  const textScale = useSyncExternalStore(
    subscribeSettings,
    getTextScale,
    getTextScale,
  );
  if (typeof document !== 'undefined') ensureCraftBuddyFonts();
  useEffect(() => {
    // Root-level so portalled tooltips and dialogs scale with the panel.
    document.documentElement.style.setProperty(
      TEXT_SCALE_VAR,
      String(textScale),
    );
  }, [textScale]);
  return (
    <MuiThemeProvider theme={craftBuddyTheme}>{children}</MuiThemeProvider>
  );
});

export default CraftBuddyThemeProvider;
