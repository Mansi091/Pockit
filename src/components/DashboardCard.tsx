import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing } from '@/constants/theme';

interface Props {
  label: string;
  value: number | string;
  icon: keyof typeof Ionicons.glyphMap;
}

/** Stat tile: big number, small label. */
export default function DashboardCard({ label, value, icon }: Props) {
  return (
    <View style={styles.card}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow,
  },
  value: { fontSize: 26, fontWeight: '700', color: colors.text, marginTop: spacing.sm, letterSpacing: -0.5 },
  label: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
