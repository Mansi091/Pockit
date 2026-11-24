import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type AlertButton } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { registerWebDialogHost, type WebDialogRequest } from '@/web/lib/webAlert';

/**
 * Pockit-styled dialog for the website (replaces the browser's grey
 * "localhost says" pop-ups). Shows every Alert.alert with its real buttons:
 * Cancel on the left, destructive actions in red, the main action dark.
 * Mounted once in the root layout, web only. Several alerts queue up.
 */
export default function WebDialogHost() {
  const [queue, setQueue] = useState<WebDialogRequest[]>([]);
  const current = queue[0];

  useEffect(() => {
    registerWebDialogHost((req) => setQueue((q) => [...q, req]));
    return () => registerWebDialogHost(null);
  }, []);

  const close = (onPress?: AlertButton['onPress']) => {
    setQueue((q) => q.slice(1));
    // Run after closing so a handler that opens another dialog/screen isn't hidden by this one.
    if (onPress) setTimeout(() => (onPress as () => void)(), 0);
  };

  if (!current) return null;
  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const ordered = [...(cancel ? [cancel] : []), ...current.buttons.filter((b) => b !== cancel)];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(cancel?.onPress)}>
      <Pressable style={styles.backdrop} onPress={() => cancel && close(cancel.onPress)} accessibilityLabel="Close">
        <Pressable style={styles.card} accessibilityRole="alert" onPress={() => {}}>
          <Text style={styles.title}>{current.title}</Text>
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}
          <View style={styles.buttons}>
            {ordered.map((b, i) => {
              const isCancel = b.style === 'cancel';
              const isDanger = b.style === 'destructive';
              const isMain = !isCancel && !isDanger && i === ordered.length - 1;
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  onPress={() => close(b.onPress)}
                  style={({ hovered }) => [
                    styles.btn,
                    isMain && styles.btnMain,
                    isDanger && styles.btnDanger,
                    !isMain && !isDanger && styles.btnPlain,
                    hovered && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.btnText, isMain && { color: colors.textOnPrimary }, isDanger && { color: '#FFFFFF' }]}>
                    {b.text ?? 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,22,18,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 19, color: colors.text, letterSpacing: -0.3 },
  message: { fontFamily: 'Manrope_400Regular', fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  btn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnMain: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: colors.danger },
  btnPlain: { backgroundColor: colors.surfaceMuted },
  btnText: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: colors.text },
});
