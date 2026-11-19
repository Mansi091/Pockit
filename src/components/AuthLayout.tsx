import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';

/** Shared frame for all sign-in / sign-up / recovery screens. */
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
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="wallet" size={20} color={colors.textOnPrimary} />
          </View>
          <Text style={styles.appName}>Pockit</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <View style={styles.body}>{children}</View>

        {footer && <View style={styles.footer}>{footer}</View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.xl, flexGrow: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxl + spacing.lg },
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
});
