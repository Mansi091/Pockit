import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import CategoryEditor from '@/components/CategoryEditor';
import { getCategories, type CategoryWithCount } from '@/services/categoryService';
import { useContactsVersion } from '@/services/dataEvents';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Review-screen section: ⭐ Favourite toggle + tap-to-select category chips
 * (a contact can be in several) + "New category" created in place and auto-selected.
 */
export default function CategoryPicker({
  selected,
  onChange,
  favourite,
  onFavouriteChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  favourite: boolean;
  onFavouriteChange: (v: boolean) => void;
}) {
  const version = useContactsVersion();
  const [all, setAll] = useState<CategoryWithCount[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    getCategories().then(setAll).catch(() => setAll([]));
  }, []);
  useEffect(load, [load, version]);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <View>
      <Pressable
        onPress={() => onFavouriteChange(!favourite)}
        style={[styles.fav, favourite && styles.favOn]}
        accessibilityRole="switch"
        accessibilityState={{ checked: favourite }}
        accessibilityLabel="Favourite"
      >
        <Ionicons name={favourite ? 'star' : 'star-outline'} size={20} color={favourite ? '#F59E0B' : colors.textMuted} />
        <Text style={[styles.favText, favourite && { color: colors.text }]}>{favourite ? 'Favourite' : 'Add to Favourites'}</Text>
      </Pressable>

      <Text style={styles.label}>Categories</Text>
      <View style={styles.chips}>
        {all.map((c) => {
          const on = selected.includes(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => toggle(c.id)}
              style={[styles.chip, { borderColor: c.color }, on && { backgroundColor: c.color }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={c.name}
            >
              {c.icon ? (
                <Ionicons name={c.icon as IconName} size={14} color={on ? '#fff' : c.color} />
              ) : (
                <View style={[styles.dot, { backgroundColor: on ? '#fff' : c.color }]} />
              )}
              <Text style={[styles.chipText, { color: on ? '#fff' : colors.text }]} numberOfLines={1}>{c.name}</Text>
              {on && <Ionicons name="checkmark" size={14} color="#fff" />}
            </Pressable>
          );
        })}
        <Pressable onPress={() => setCreating(true)} style={styles.newChip} accessibilityRole="button" accessibilityLabel="New category">
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.newText}>New category</Text>
        </Pressable>
      </View>
      {all.length === 0 && <Text style={styles.hint}>Group people — e.g. Family, Clients, or the event where you met.</Text>}

      <CategoryEditor
        visible={creating}
        category={null}
        onClose={() => setCreating(false)}
        onSaved={(c) => {
          onChange([...selected, c.id]);
          load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: spacing.lg,
  },
  favOn: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  favText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  label: { ...typography.label, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 220,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, fontWeight: '600' },
  newChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  newText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  hint: { ...typography.caption, marginBottom: spacing.md },
});
