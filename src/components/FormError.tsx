import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';

export default function FormError({ message, tone = 'error' }: { message: string | null; tone?: 'error' | 'info' }) {
  if (!message) return null;
  const info = tone === 'info';
  return (
    <View style={[styles.box, info && styles.info]} accessibilityLiveRegion="polite">
      <Ionicons
        name={info ? 'information-circle-outline' : 'alert-circle-outline'}
        size={18}
        color={info ? colors.accent : colors.danger}
      />
      <Text style={[styles.text, info && { color: colors.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  info: { backgroundColor: colors.accentSoft },
  text: { flex: 1, color: colors.danger, fontSize: 14, lineHeight: 20 },
});
