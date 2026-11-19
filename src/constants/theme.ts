/**
 * Pockit design system — "modern minimal".
 * White surfaces, one strong accent (indigo), soft shadows, generous radius.
 * Change values here instead of hard-coding styles inside components.
 */
export const colors = {
  primary: '#4F46E5', // indigo — the single brand accent
  primaryDark: '#4338CA',
  primarySoft: '#EEF2FF',
  accent: '#4F46E5', // kept as an alias so older screens stay on-brand
  accentSoft: '#EEF2FF',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  border: '#E5E7EB',
  text: '#0F172A',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
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
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
  caption: { fontSize: 12, color: colors.textMuted },
};

export const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.05,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 1,
};
