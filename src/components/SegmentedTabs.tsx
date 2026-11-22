import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing } from '@/constants/theme';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Small count bubble (hidden when 0 / undefined). */
  badge?: number;
  /** Red badge (e.g. overdue follow-ups). */
  urgent?: boolean;
}

/** Top tabs inside a screen (Planner: Follow-ups · Calendar · Events; Contact: Details · Notes · Follow-ups). */
export default function SegmentedTabs<K extends string>({
  tabs,
  value,
  onChange,
  style,
}: {
  tabs: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={[styles.tab, on && styles.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.badge ? `${t.label}, ${t.badge}` : t.label}
          >
            {t.icon && <Ionicons name={t.icon} size={15} color={on ? colors.primary : colors.textMuted} />}
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {t.label}
            </Text>
            {!!t.badge && (
              <View style={[styles.badge, t.urgent && { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{t.badge > 99 ? '99+' : t.badge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
  },
  tabOn: { backgroundColor: colors.surface, ...shadow },
  text: { fontSize: 13, fontWeight: '600', color: colors.textMuted, flexShrink: 1 },
  textOn: { color: colors.text },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

export const tabSpacing = spacing.lg;
