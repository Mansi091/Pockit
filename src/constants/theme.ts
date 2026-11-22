/**
 * Pockit redesign system.
 * Light, neutral surfaces with restrained charcoal actions and category colours.
 */
export const colors = {
  primary: '#292D26',
  primaryDark: '#30372A',
  primarySoft: '#F1F2EC',
  accent: '#687C58',
  accentSoft: '#E8F1E9',
  background: '#F7F7F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F2EC',
  border: '#E9EAE3',
  text: '#232522',
  textMuted: '#797E71',
  textSubtle: '#9A9E91',
  textOnPrimary: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
  success: '#059669',
  successSoft: '#ECFDF5',
} as const;

/** Soft avatar palettes, picked deterministically from a name. */
export const avatarPalette = [
  { bg: '#EEF2FF', fg: '#4338CA' },
  { bg: '#ECFDF5', fg: '#047857' },
  { bg: '#FFF7ED', fg: '#C2410C' },
  { bg: '#FDF2F8', fg: '#BE185D' },
  { bg: '#F0F9FF', fg: '#0369A1' },
  { bg: '#F5F3FF', fg: '#6D28D9' },
] as const;

export function avatarColors(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return avatarPalette[h % avatarPalette.length]!;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 13,
  lg: 18,
  pill: 999,
} as const;

export const typography = {
  display: { fontFamily: 'Manrope_700Bold', fontSize: 28, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.8 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 24, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.6 },
  heading: { fontFamily: 'Manrope_700Bold', fontSize: 17, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.3 },
  body: { fontFamily: 'Manrope_400Regular', fontSize: 15, color: colors.text },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
  caption: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: colors.textMuted },
};

export const shadow = {
  shadowColor: '#293120',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
  elevation: 2,
};
