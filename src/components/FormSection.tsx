import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing } from '@/constants/theme';

/** A titled white card grouping related form fields (Review Contact sections). */
export default function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name={icon} size={16} color={colors.primary} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    marginBottom: spacing.lg,
    ...shadow,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  title: { fontSize: 13, fontWeight: '700', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.6 },
});
