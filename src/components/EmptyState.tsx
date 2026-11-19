import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing } from '@/constants/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, message, action }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={40} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  message: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  action: { marginTop: spacing.lg, alignSelf: 'stretch' },
});
