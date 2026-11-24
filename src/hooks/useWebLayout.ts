import { Platform, useWindowDimensions } from 'react-native';

/**
 * Desktop-website layout helper. On the web at ≥ 900 px wide we switch to a
 * desktop layout (left sidebar, centred content). Phones and narrow browser
 * windows keep the app layout.
 */
export const SIDEBAR_WIDTH = 248;
export const CONTENT_MAX = 1080; // list / dashboard screens
export const FORM_MAX = 820; // forms and detail screens

export function useWebLayout() {
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= 900;
  /** Side padding that centres content of at most `max` px inside `available` px. */
  const gutter = (available: number, max: number) => (isWide ? Math.max(32, Math.round((available - max) / 2)) : 0);
  return { isWide, width, gutter };
}
