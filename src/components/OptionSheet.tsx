import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';

/** Small bottom sheet with a list of choices (used for phone/email labels). */
export default function OptionSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  labelOf,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly T[];
  selected?: T;
  labelOf: (o: T) => string;
  onSelect: (o: T) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        {options.map((o) => (
          <Pressable
            key={o}
            onPress={() => {
              onSelect(o);
              onClose();
            }}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceMuted }]}
            accessibilityRole="button"
            accessibilityState={{ selected: o === selected }}
          >
            <Text style={[styles.optionText, o === selected && styles.optionSelected]}>{labelOf(o)}</Text>
            {o === selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  title: { fontSize: 13, fontWeight: '600', color: colors.textMuted, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
  optionText: { fontSize: 16, color: colors.text },
  optionSelected: { fontWeight: '600', color: colors.primary },
});
