import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import CategoryEditor from '@/components/CategoryEditor';
import CustomButton from '@/components/CustomButton';
import {
  addStarterCategories,
  getCategories,
  getCategoryOverlaps,
  STARTER_CATEGORIES,
  type CategoryWithCount,
} from '@/services/categoryService';
import { searchContacts } from '@/services/contactService';
import { useContactsVersion } from '@/services/dataEvents';
import { edgesToLines, packBubbles, ringLayout, type Edge } from '@/utils/categoryLayout';
import type { Category } from '@/types/contact';

type View3 = 'bubbles' | 'connections' | 'list';
type IconName = keyof typeof Ionicons.glyphMap;

const FAV_ID = '__favourites__';
const GOLD = '#F59E0B';

/**
 * Categories tab — how your network is organised.
 *  Bubbles:     one bubble per category, area ∝ number of contacts (tap = open, long-press = edit)
 *  Connections: categories linked by the people they share (line thickness = shared contacts)
 *  List:        plain, accessible list with counts
 */
export default function CategoriesScreen() {
  const version = useContactsVersion();
  const [mode, setMode] = useState<View3>('bubbles');
  const [cats, setCats] = useState<CategoryWithCount[] | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [favCount, setFavCount] = useState(0);
  const [width, setWidth] = useState(0);
  const [editing, setEditing] = useState<Category | null | 'new'>(null);
  const [starterPicks, setStarterPicks] = useState<string[]>(['Family', 'Friends', 'Clients', 'Office']);

  const load = useCallback(async () => {
    const [c, e, favs] = await Promise.all([getCategories(), getCategoryOverlaps(), searchContacts('', { favouritesOnly: true })]);
    setCats(c);
    setEdges(e);
    setFavCount(favs.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setCats([]));
    }, [load, version]),
  );

  const openCategory = (id: string) =>
    id === FAV_ID
      ? router.navigate({ pathname: '/contacts', params: { favourites: '1' } })
      : router.navigate({ pathname: '/contacts', params: { category: id } });

  const byId = useMemo(() => new Map((cats ?? []).map((c) => [c.id, c])), [cats]);
  const canvasH = Math.round(width * 0.95);

  const bubbles = useMemo(() => {
    if (!cats || !width) return [];
    const nodes = cats.map((c) => ({ id: c.id, count: c.count }));
    if (favCount > 0) nodes.push({ id: FAV_ID, count: favCount });
    return packBubbles(nodes, width, canvasH, 10);
  }, [cats, favCount, width, canvasH]);

  const ring = useMemo(() => (cats && width ? ringLayout(cats.map((c) => ({ id: c.id, count: c.count })), width, canvasH) : []), [cats, width, canvasH]);
  const lines = useMemo(() => edgesToLines(edges, ring), [edges, ring]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable onPress={() => setEditing('new')} hitSlop={10} style={{ marginRight: spacing.lg }} accessibilityLabel="New category">
            <Ionicons name="add-circle" size={28} color={colors.primary} />
          </Pressable>
        ),
      }}
    />
  );

  if (!cats) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;

  // ── First run: suggest starter categories ────────────────────────────
  if (cats.length === 0) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {header}
        <View style={styles.emptyArt}>
          {['#DB2777', '#4F46E5', '#16A34A'].map((c, i) => (
            <View key={c} style={[styles.emptyBubble, { backgroundColor: c, width: 90 - i * 18, height: 90 - i * 18, borderRadius: 45 - i * 9 }]} />
          ))}
        </View>
        <Text style={styles.title}>Organise your network</Text>
        <Text style={styles.subtitle}>Group people into categories — a contact can be in several. Pick some to start:</Text>
        <View style={styles.starters}>
          {STARTER_CATEGORIES.map((s) => {
            const on = starterPicks.includes(s.name);
            return (
              <Pressable
                key={s.name}
                onPress={() => setStarterPicks(on ? starterPicks.filter((n) => n !== s.name) : [...starterPicks, s.name])}
                style={[styles.starter, { borderColor: s.color }, on && { backgroundColor: s.color }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Ionicons name={s.icon as IconName} size={15} color={on ? '#fff' : s.color} />
                <Text style={[styles.starterText, { color: on ? '#fff' : colors.text }]}>{s.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <CustomButton
          title={starterPicks.length ? `Add ${starterPicks.length} categories` : 'Pick at least one'}
          icon="checkmark"
          disabled={!starterPicks.length}
          onPress={() => addStarterCategories(starterPicks).then(load)}
        />
        <CustomButton title="Create my own" icon="add" variant="ghost" onPress={() => setEditing('new')} />
        <CategoryEditor visible={editing !== null} category={null} onClose={() => setEditing(null)} onSaved={load} />
      </ScrollView>
    );
  }

  const total = cats.reduce((n, c) => n + c.count, 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {header}
      <Text style={styles.summary}>
        {cats.length} categories · {total} placements{favCount ? ` · ${favCount} favourites` : ''}
      </Text>

      {/* View switcher */}
      <View style={styles.segment} accessibilityRole="tablist">
        {(['bubbles', 'connections', 'list'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.segmentBtn, mode === m && styles.segmentOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
          >
            <Ionicons
              name={m === 'bubbles' ? 'ellipse' : m === 'connections' ? 'git-network-outline' : 'list'}
              size={14}
              color={mode === m ? colors.text : colors.textMuted}
            />
            <Text style={[styles.segmentText, mode === m && { color: colors.text }]}>
              {m === 'bubbles' ? 'Bubbles' : m === 'connections' ? 'Connections' : 'List'}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'list' ? (
        <View style={styles.listCard}>
          {favCount > 0 && <ListRow color={GOLD} icon="star" name="Favourites" count={favCount} onPress={() => openCategory(FAV_ID)} />}
          {cats.map((c, i) => (
            <ListRow
              key={c.id}
              color={c.color}
              icon={c.icon as IconName | null}
              name={c.name}
              count={c.count}
              last={i === cats.length - 1}
              onPress={() => openCategory(c.id)}
              onEdit={() => setEditing(c)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.canvasCard} onLayout={onLayout}>
          <View style={{ height: canvasH || 300 }}>
            {mode === 'bubbles' &&
              bubbles.map((b) => {
                const isFav = b.id === FAV_ID;
                const c = byId.get(b.id);
                const color = isFav ? GOLD : c?.color ?? colors.primary;
                const name = isFav ? 'Favourites' : c?.name ?? '';
                const count = isFav ? favCount : c?.count ?? 0;
                const big = b.r >= 34;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => openCategory(b.id)}
                    onLongPress={() => c && setEditing(c)}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}, ${count} contacts`}
                    accessibilityHint="Opens these contacts. Long-press to edit."
                    style={({ pressed }) => [
                      styles.bubble,
                      { left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, borderRadius: b.r, backgroundColor: color },
                      pressed && { transform: [{ scale: 0.96 }] },
                    ]}
                  >
                    {isFav ? (
                      <Ionicons name="star" size={Math.max(12, b.r * 0.32)} color="#fff" />
                    ) : (
                      c?.icon && big && <Ionicons name={c.icon as IconName} size={Math.min(22, b.r * 0.3)} color="#fff" />
                    )}
                    {big && (
                      <Text style={[styles.bubbleName, { fontSize: Math.min(16, b.r * 0.26) }]} numberOfLines={2}>
                        {name}
                      </Text>
                    )}
                    <Text style={[styles.bubbleCount, { fontSize: Math.max(11, Math.min(26, b.r * 0.36)) }]}>{count}</Text>
                  </Pressable>
                );
              })}

            {mode === 'connections' && (
              <>
                {lines.map((l) => (
                  <View key={l.key} pointerEvents="none">
                    <View
                      style={[
                        styles.line,
                        { left: l.x, top: l.y, width: l.length, height: l.thickness, transform: [{ rotate: `${l.angleDeg}deg` }] },
                      ]}
                    />
                    <View style={[styles.lineBadge, { left: l.mid.x - 12, top: l.mid.y - 10 }]}>
                      <Text style={styles.lineBadgeText}>{l.shared}</Text>
                    </View>
                  </View>
                ))}
                {ring.map((p) => {
                  const c = byId.get(p.id)!;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => openCategory(p.id)}
                      onLongPress={() => setEditing(c)}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.name}, ${c.count} contacts`}
                      style={[styles.bubble, { left: p.x - p.r, top: p.y - p.r, width: p.r * 2, height: p.r * 2, borderRadius: p.r, backgroundColor: c.color }]}
                    >
                      <Text style={styles.bubbleCount}>{c.count}</Text>
                    </Pressable>
                  );
                })}
                {ring.map((p) => {
                  const c = byId.get(p.id)!;
                  return (
                    <Text key={`${p.id}-label`} pointerEvents="none" numberOfLines={1} style={[styles.ringLabel, { left: p.x - 50, top: p.y + p.r + 2 }]}>
                      {c.name}
                    </Text>
                  );
                })}
              </>
            )}
          </View>
          {mode === 'connections' && (
            <Text style={styles.legend}>
              {lines.length
                ? 'Lines join categories that share people — the number is how many.'
                : 'No connections yet. Put a contact in two categories (e.g. Clients + Expo Pune) to see how your groups overlap.'}
            </Text>
          )}
          {mode === 'bubbles' && <Text style={styles.legend}>Bigger bubble = more people. Tap to open · long-press to edit.</Text>}
        </View>
      )}

      <CategoryEditor
        visible={editing !== null}
        category={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={load}
        onDeleted={load}
      />
    </ScrollView>
  );
}

function ListRow({ color, icon, name, count, onPress, onEdit, last }: {
  color: string; icon: IconName | null; name: string; count: number; onPress: () => void; onEdit?: () => void; last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { backgroundColor: colors.surfaceMuted }]} accessibilityRole="button">
      <View style={[styles.rowIcon, { backgroundColor: color }]}>
        {icon ? <Ionicons name={icon} size={16} color="#fff" /> : <View style={styles.rowDot} />}
      </View>
      <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
      <Text style={styles.rowCount}>{count}</Text>
      {onEdit && (
        <Pressable onPress={onEdit} hitSlop={10} accessibilityLabel={`Edit ${name}`} style={{ padding: 4 }}>
          <Ionicons name="create-outline" size={18} color={colors.textMuted} />
        </Pressable>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  summary: { ...typography.caption, marginBottom: spacing.md },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4, marginBottom: spacing.lg },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.surface, ...shadow },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  canvasCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm, ...shadow },
  bubble: { position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: 6, overflow: 'hidden' },
  bubbleName: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  bubbleCount: { color: '#fff', fontWeight: '800' },
  line: { position: 'absolute', backgroundColor: '#C7D2FE', borderRadius: 4 },
  lineBadge: {
    position: 'absolute',
    minWidth: 24,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  lineBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  ringLabel: { position: 'absolute', width: 100, textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.text },
  legend: { ...typography.caption, textAlign: 'center', padding: spacing.sm },
  listCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  rowName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  rowCount: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  emptyArt: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginVertical: spacing.xl },
  emptyBubble: { opacity: 0.9 },
  title: { ...typography.title, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl, lineHeight: 22 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  starter: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  starterText: { fontSize: 14, fontWeight: '600' },
});
