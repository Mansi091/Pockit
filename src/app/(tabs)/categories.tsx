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

  const header = <Stack.Screen options={{ headerShown: false }} />;
  const pageHeading = (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderCopy}>
        <Text style={styles.pageEyebrow}>YOUR NETWORK</Text>
        <Text style={styles.pageTitle}>Categories</Text>
        <Text style={styles.pageSubtitle}>Organise the people you know.</Text>
      </View>
      <Pressable
        onPress={() => setEditing('new')}
        accessibilityRole="button"
        accessibilityLabel="Create a category"
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={23} color={colors.textOnPrimary} />
      </Pressable>
    </View>
  );

  if (!cats) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;

  // ── First run: suggest starter categories ────────────────────────────
  if (cats.length === 0) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {header}
        {pageHeading}
        <View style={styles.emptyArt}>
          {['#DB2777', '#4F46E5', '#16A34A'].map((c, i) => (
            <View key={c} style={[styles.emptyBubble, { backgroundColor: c, width: 90 - i * 18, height: 90 - i * 18, borderRadius: 45 - i * 9 }]} />
          ))}
        </View>
        <Text style={styles.title}>A place for every connection</Text>
        <Text style={styles.subtitle}>Group people by how you know them. A contact can belong to more than one category.</Text>
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
      {pageHeading}
      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}><Ionicons name="pricetags" size={17} color={colors.primary} /></View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>
            {cats.length} categories <Text style={styles.summaryDot}>·</Text> {total} placements{favCount ? <Text> <Text style={styles.summaryDot}>·</Text> {favCount} favourites</Text> : null}
          </Text>
          <Text style={styles.summaryHint}>Your contacts, thoughtfully organised</Text>
        </View>
      </View>

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
              size={16}
              color={mode === m ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.segmentText, mode === m && styles.segmentTextOn]}>
              {m === 'bubbles' ? 'Bubbles' : m === 'connections' ? 'Connections' : 'List'}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'list' ? (
        <View style={styles.listSection}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Your categories</Text>
              <Text style={styles.sectionSubtitle}>Tap a group to see its people</Text>
            </View>
            <Text style={styles.countBadge}>{cats.length}</Text>
          </View>
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
        </View>
      ) : (
        <View style={styles.canvasCard} onLayout={onLayout}>
          <View style={styles.canvasHeading}>
            <View style={styles.canvasHeadingIcon}>
              <Ionicons name={mode === 'bubbles' ? 'ellipse' : 'git-network-outline'} size={17} color={colors.primary} />
            </View>
            <View style={styles.canvasHeadingCopy}>
              <Text style={styles.canvasTitle}>{mode === 'bubbles' ? 'Category map' : 'Shared connections'}</Text>
              <Text style={styles.canvasSubtitle}>{mode === 'bubbles' ? 'Larger circles have more people' : 'See where your groups overlap'}</Text>
            </View>
          </View>
          <View style={{ height: canvasH || 300 }}>
            {mode === 'bubbles' &&
              bubbles.map((b) => {
                const isFav = b.id === FAV_ID;
                const c = byId.get(b.id);
                const color = isFav ? GOLD : c?.color ?? colors.primary;
                const name = isFav ? 'Favourites' : c?.name ?? '';
                const count = isFav ? favCount : c?.count ?? 0;
                const big = b.r >= 34;
                const foreground = readableOn(color);
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
                      styles.bubbleShadow,
                      pressed && styles.pressed,
                    ]}
                  >
                    {isFav ? (
                      <Ionicons name="star" size={Math.max(12, b.r * 0.32)} color={foreground} />
                    ) : (
                      c?.icon && big && <Ionicons name={c.icon as IconName} size={Math.min(22, b.r * 0.3)} color={foreground} />
                    )}
                    {big && (
                      <Text style={[styles.bubbleName, { color: foreground, fontSize: Math.min(16, b.r * 0.26) }]} numberOfLines={2}>
                        {name}
                      </Text>
                    )}
                    <Text style={[styles.bubbleCount, { color: foreground, fontSize: Math.max(11, Math.min(26, b.r * 0.36)) }]}>{count}</Text>
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
                    <View style={[styles.lineBadge, { left: l.mid.x - 13, top: l.mid.y - 10 }]}>
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
                      style={({ pressed }) => [styles.bubble, styles.bubbleShadow, { left: p.x - p.r, top: p.y - p.r, width: p.r * 2, height: p.r * 2, borderRadius: p.r, backgroundColor: c.color }, pressed && styles.pressed]}
                    >
                      <Text style={[styles.bubbleCount, { color: readableOn(c.color) }]}>{c.count}</Text>
                    </Pressable>
                  );
                })}
                {ring.map((p) => {
                  const c = byId.get(p.id)!;
                  return (
                    <Text key={`${p.id}-label`} pointerEvents="none" numberOfLines={1} style={[styles.ringLabel, { left: p.x - 54, top: p.y + p.r + 5 }]}>
                      {c.name}
                    </Text>
                  );
                })}
              </>
            )}
          </View>
          {mode === 'connections' && (
            <View style={styles.legendBox}>
              <Ionicons name={lines.length ? 'information-circle-outline' : 'git-network-outline'} size={17} color={colors.accent} />
              <Text style={styles.legend}>
                {lines.length
                  ? 'Lines connect categories that share people. The number shows how many.'
                  : 'No overlaps yet. Add a contact to more than one category to see your groups connect.'}
              </Text>
            </View>
          )}
          {mode === 'bubbles' && <Text style={styles.legend}>{'Tap a circle to view people · long-press to edit'}</Text>}
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
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.rowMain, pressed && styles.rowMainPressed]} accessibilityRole="button" accessibilityLabel={`${name}, ${count} contacts`}>
        <View style={[styles.rowIcon, { backgroundColor: color }]}>
          {icon ? <Ionicons name={icon} size={17} color={readableOn(color)} /> : <View style={styles.rowDot} />}
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
          <Text style={styles.rowMeta}>{count === 0 ? 'No contacts yet' : 'Tap to view contacts'}</Text>
        </View>
        <View style={styles.rowCountBadge}><Text style={styles.rowCount}>{count}</Text></View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </Pressable>
      {onEdit && (
        <Pressable onPress={onEdit} hitSlop={7} accessibilityRole="button" accessibilityLabel={`Edit ${name}`} style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}>
          <Ionicons name="create-outline" size={18} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}

function readableOn(hex: string) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return '#FFFFFF';
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  return luminance > 0.42 ? colors.text : '#FFFFFF';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  pageHeaderCopy: { flex: 1, paddingRight: spacing.md },
  pageEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 3 },
  pageTitle: { ...typography.display, fontSize: 30, lineHeight: 36 },
  pageSubtitle: { ...typography.body, color: colors.textMuted, marginTop: 2, fontSize: 14 },
  addButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow },
  pressed: { opacity: 0.86, transform: [{ scale: 0.97 }] },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  summaryIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1 },
  summaryTitle: { ...typography.label, color: colors.text, fontSize: 13 },
  summaryDot: { color: colors.textSubtle },
  summaryHint: { ...typography.caption, marginTop: 2, fontSize: 11 },
  segment: { flexDirection: 'row', backgroundColor: '#ECEEE7', borderRadius: 17, padding: 4, marginTop: spacing.xs, marginBottom: spacing.xs },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 14 },
  segmentOn: { backgroundColor: colors.surface, ...shadow },
  segmentText: { ...typography.label, fontSize: 12, color: colors.textMuted },
  segmentTextOn: { color: colors.text },
  canvasCard: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow },
  canvasHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, paddingHorizontal: 2 },
  canvasHeadingIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  canvasHeadingCopy: { flex: 1 },
  canvasTitle: { ...typography.heading, fontSize: 15 },
  canvasSubtitle: { ...typography.caption, fontSize: 11, marginTop: 1 },
  listSection: { gap: spacing.sm },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { ...typography.heading },
  sectionSubtitle: { ...typography.caption, marginTop: 2 },
  countBadge: { minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, backgroundColor: colors.primarySoft, color: colors.primary, textAlign: 'center', textAlignVertical: 'center', fontSize: 13, fontWeight: '700', overflow: 'hidden' },
  bubble: { position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: 6, overflow: 'hidden' },
  bubbleShadow: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', shadowColor: '#283126', shadowOpacity: 0.14, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  bubbleName: { fontWeight: '700', textAlign: 'center', letterSpacing: -0.2 },
  bubbleCount: { fontWeight: '800' },
  line: { position: 'absolute', backgroundColor: '#A9B39E', borderRadius: 4, opacity: 0.72 },
  lineBadge: {
    position: 'absolute',
    minWidth: 24,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  lineBadgeText: { fontSize: 11, fontWeight: '700', color: colors.text },
  ringLabel: { position: 'absolute', width: 108, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.text, backgroundColor: colors.surface, borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: 5, paddingVertical: 2 },
  legendBox: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  legend: { ...typography.caption, flex: 1, lineHeight: 18, fontSize: 11 },
  listCard: { backgroundColor: colors.surface, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md },
  rowMain: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingRight: spacing.sm },
  rowMainPressed: { opacity: 0.7 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  rowCopy: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { ...typography.caption, fontSize: 11, marginTop: 2 },
  rowCountBadge: { minWidth: 32, height: 28, paddingHorizontal: 7, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowCount: { fontSize: 12, fontWeight: '700', color: colors.primary },
  editButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  editButtonPressed: { backgroundColor: colors.border, transform: [{ scale: 0.95 }] },
  emptyArt: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginTop: spacing.xl, marginBottom: spacing.md },
  emptyBubble: { opacity: 0.9 },
  title: { ...typography.title, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 22 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  starter: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  starterText: { fontSize: 14, fontWeight: '600' },
});
