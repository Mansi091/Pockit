import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/constants/theme';

/** Bottom sheet shell used by the note / follow-up / event editors and pickers. */
export default function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
  tall,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling content (e.g. Save / Delete buttons). */
  footer?: ReactNode;
  /** Use most of the screen height (lists). */
  tall?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.sheet, tall && styles.tall, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={tall ? { flex: 1 } : undefined} contentContainerStyle={{ paddingBottom: spacing.sm }}>
            {children}
          </ScrollView>
          {footer && <View style={styles.footer}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const sheetStyles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  label: { ...typography.label, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  tall: { height: '85%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  title: { ...typography.heading, marginBottom: spacing.md },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
});
