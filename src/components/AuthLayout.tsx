import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useWebLayout } from '@/hooks/useWebLayout';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'scan-outline', text: 'Scan a business card and the details fill themselves in' },
  { icon: 'people-outline', text: 'Every contact, note and follow-up in one place' },
  { icon: 'phone-portrait-outline', text: 'The same account on your phone and on the web' },
];

/**
 * Shared frame for all sign-in / sign-up / recovery screens.
 * Phone: one column. Desktop website: brand panel on the left, the form in a
 * centred card on the right (inputs never stretch across a wide screen).
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { isWide } = useWebLayout();

  const brand = (
    <View style={styles.brand}>
      <View style={styles.logo}>
        <Ionicons name="wallet" size={20} color={colors.textOnPrimary} />
      </View>
      <Text style={styles.appName}>Pockit</Text>
    </View>
  );

  const form = (
    <>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <View style={styles.body}>{children}</View>
    </>
  );

  if (isWide) {
    return (
      <View style={styles.wideRoot}>
        <View style={styles.panel}>
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: colors.surface }]}>
              <Ionicons name="wallet" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.appName, { color: colors.textOnPrimary }]}>pockit.</Text>
          </View>
          <View style={{ gap: spacing.lg }}>
            <Text style={styles.panelTitle}>Your network,{'\n'}in your pocket.</Text>
            {FEATURES.map((f) => (
              <View key={f.text} style={styles.feature}>
                <View style={styles.featureIcon}>
                  <Ionicons name={f.icon} size={18} color={colors.textOnPrimary} />
                </View>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.panelFoot}>© Pockit</Text>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.wideScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {form}
            {footer && <View style={styles.wideFooter}>{footer}</View>}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ marginBottom: spacing.xxl + spacing.lg }}>{brand}</View>
        {form}
        {footer && <View style={styles.footer}>{footer}</View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.xl, flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  title: typography.display,
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 22 },
  body: { marginTop: spacing.xl },
  footer: { marginTop: 'auto', paddingTop: spacing.xl, alignItems: 'center' },

  // Desktop website
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  panel: {
    width: '42%',
    maxWidth: 560,
    backgroundColor: colors.primary,
    padding: 48,
    justifyContent: 'space-between',
  },
  panelTitle: { fontSize: 40, lineHeight: 48, fontWeight: '700', letterSpacing: -1.5, color: colors.textOnPrimary, marginBottom: spacing.md },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { fontSize: 15, color: '#E6E8E1', flex: 1, lineHeight: 21 },
  panelFoot: { fontSize: 12, color: '#B8BDB0' },
  wideScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 40,
  },
  wideFooter: { marginTop: spacing.xl, alignItems: 'center' },
});
