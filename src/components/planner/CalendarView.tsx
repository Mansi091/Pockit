import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import { useContactsVersion } from '@/services/dataEvents';
import { getCalendarItems, type CalendarItem } from '@/services/activityService';
import { dayKey, formatTime, monthGrid, monthTitle, relativeDay, WEEKDAY_HEADERS } from '@/utils/dates';

type Kind = CalendarItem['kind'];
const KIND: Record<Kind, { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  met: { color: '#4F46E5', icon: 'chatbubble-ellipses-outline', label: 'Met' },
  followup: { color: '#D97706', icon: 'alarm-outline', label: 'Follow-up' },
  added: { color: '#059669', icon: 'person-add-outline', label: 'Added' },
  event: { color: '#DB2777', icon: 'calendar-outline', label: 'Event' },
};
const ORDER: Kind[] = ['event', 'followup', 'met', 'added'];

/** Planner → Calendar: a month grid with coloured dots, and the selected day's timeline below. */
export default function CalendarView() {
  const version = useContactsVersion();
  const today = dayKey(new Date());
  const [month, setMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [selected, setSelected] = useState(today);
  const [items, setItems] = useState<CalendarItem[] | null>(null);

  const weeks = useMemo(() => monthGrid(month.y, month.m), [month]);
  const from = weeks.flat().find(Boolean)!;
  const to = [...weeks.flat()].reverse().find(Boolean)!;

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getCalendarItems(from, to)
        .then((r) => live && setItems(r))
        .catch(() => live && setItems([]));
      return () => {
        live = false;
      };
    }, [from, to, version]),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items ?? []) map.set(it.day, [...(map.get(it.day) ?? []), it]);
    return map;
  }, [items]);

  const shift = (delta: number) => {
    setItems(null);
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };
  const goToday = () => {
    const now = new Date();
    if (now.getFullYear() !== month.y || now.getMonth() !== month.m) setItems(null);
    setMonth({ y: now.getFullYear(), m: now.getMonth() });
    setSelected(today);
  };

  const dayItems = (byDay.get(selected) ?? []).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  const open = (it: CalendarItem) => {
    if (it.kind === 'event') router.push({ pathname: '/event/[id]', params: { id: it.eventId } });
    else router.push({ pathname: '/contact/[id]', params: { id: it.contactId, ...(it.kind === 'followup' ? { tab: 'followups' } : it.kind === 'met' ? { tab: 'notes' } : {}) } });
  };

  return (
    <View>
      <View style={styles.card}>
        {/* Month header */}
        <View style={styles.header}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month" style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.month}>{monthTitle(month.y, month.m)}</Text>
          <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityLabel="Next month" style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.week}>
          {WEEKDAY_HEADERS.map((d, i) => (
            <Text key={i} style={styles.weekday}>{d}</Text>
          ))}
        </View>

        {weeks.map((w, wi) => (
          <View key={wi} style={styles.week}>
            {w.map((d, di) => {
              if (!d) return <View key={di} style={styles.cell} />;
              const kinds = [...new Set((byDay.get(d) ?? []).map((x) => x.kind))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
              const isSel = d === selected;
              const isToday = d === today;
              return (
                <Pressable
                  key={di}
                  onPress={() => setSelected(d)}
                  style={styles.cell}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${relativeDay(d)}${kinds.length ? `, ${kinds.map((k) => KIND[k].label).join(', ')}` : ''}`}
                >
                  <View style={[styles.dayCircle, isToday && styles.todayCircle, isSel && styles.selCircle]}>
                    <Text style={[styles.dayText, isToday && { color: colors.primary, fontWeight: '700' }, isSel && { color: '#fff', fontWeight: '700' }]}>
                      {Number(d.slice(8))}
                    </Text>
                  </View>
                  <View style={styles.dots}>
                    {kinds.slice(0, 4).map((k) => (
                      <View key={k} style={[styles.dot, { backgroundColor: KIND[k].color }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={styles.legend}>
          {ORDER.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: KIND[k].color }]} />
              <Text style={styles.legendText}>{KIND[k].label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Selected day */}
      <View style={styles.dayHeader}>
        <Text style={styles.dayTitle}>{relativeDay(selected)}</Text>
        {(selected !== today || month.y !== new Date().getFullYear() || month.m !== new Date().getMonth()) && (
          <Pressable onPress={goToday} hitSlop={8}>
            <Text style={styles.todayLink}>Go to today</Text>
          </Pressable>
        )}
      </View>

      {items === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      ) : dayItems.length === 0 ? (
        <Text style={styles.nothing}>Nothing on this day.</Text>
      ) : (
        <View style={styles.list}>
          {dayItems.map((it, i) => {
            const k = KIND[it.kind];
            const title = it.kind === 'event' ? it.name : it.personName;
            const sub =
              it.kind === 'followup'
                ? `${it.done ? 'Done · ' : ''}${formatTime(new Date(it.dueAt))} · ${it.detail}`
                : it.kind === 'met'
                  ? `Met${it.detail ? ` · ${it.detail}` : ''}`
                  : it.kind === 'added'
                    ? `Card saved${it.detail ? ` · ${it.detail}` : ''}`
                    : it.detail ?? 'Event';
            return (
              <Pressable
                key={it.id}
                onPress={() => open(it)}
                style={({ pressed }) => [styles.item, i < dayItems.length - 1 && styles.itemDivider, pressed && { backgroundColor: colors.surfaceMuted }]}
                accessibilityRole="button"
              >
                <View style={[styles.itemIcon, { backgroundColor: `${k.color}1A` }]}>
                  <Ionicons name={k.icon} size={18} color={k.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{title}</Text>
                  <Text style={styles.itemSub} numberOfLines={2}>{sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  navBtn: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  month: { ...typography.heading },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', ...typography.caption, fontWeight: '600', paddingVertical: 6 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3, minHeight: 46 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  todayCircle: { backgroundColor: colors.primarySoft },
  selCircle: { backgroundColor: colors.primary },
  dayText: { fontSize: 14, color: colors.text },
  dots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { ...typography.caption },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
  dayTitle: { ...typography.heading },
  todayLink: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  nothing: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg },
  itemDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemSub: { ...typography.caption, marginTop: 2 },
});
