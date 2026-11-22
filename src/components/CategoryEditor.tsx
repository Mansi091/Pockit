import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  createCategory,
  deleteCategory,
  MAX_NAME,
  MAX_COLOR,
  updateCategory,
  validateCategoryColor,
  validateCategoryName,
} from '@/services/categoryService';
import type { Category } from '@/types/contact';

type IconName = keyof typeof Ionicons.glyphMap;

/** Bottom sheet to create or edit a category: name, colour and an optional icon. */
export default function CategoryEditor({
  visible,
  category,
  onClose,
  onSaved,
  onDeleted,
}: {
  visible: boolean;
  /** Editing when set, creating when null. */
  category: Category | null;
  onClose: () => void;
  onSaved?: (c: Category) => void;
  onDeleted?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [customColor, setCustomColor] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(category?.name ?? '');
    setColor(category?.color ?? CATEGORY_COLORS[0]);
    setCustomColor(category?.color ?? '');
    setIcon(category?.icon ?? null);
    setError(null);
  }, [visible, category]);

  const save = async () => {
    const problem = validateCategoryName(name);
    if (problem) return setError(problem);
    const chosenColor = customColor.trim().toUpperCase();
    const colorProblem = validateCategoryColor(chosenColor);
    if (colorProblem) return setError(colorProblem);
    setBusy(true);
    try {
      if (category) {
        await updateCategory(category.id, { name, color: chosenColor, icon });
        onSaved?.({ ...category, name: name.trim(), color: chosenColor, icon });
      } else {
        onSaved?.(await createCategory({ name, color: chosenColor, icon }));
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the category.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(`Delete "${category?.name}"?`, 'The contacts stay in Pockit — they just won\'t be in this category any more.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCategory(category!.id);
          onDeleted?.();
          onClose();
        },
      },
    ]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{category ? 'Edit category' : 'New category'}</Text>

          {/* Live preview */}
          <View style={[styles.preview, { backgroundColor: color }]}>
            {icon && <Ionicons name={icon as IconName} size={16} color="#fff" />}
            <Text style={styles.previewText} numberOfLines={1}>{name.trim() || 'Category name'}</Text>
          </View>

          <FormError message={error} />
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            placeholder="e.g. Clients, Family, Expo Pune 2026"
            placeholderTextColor={colors.textSubtle}
            maxLength={MAX_NAME}
            style={styles.input}
            autoFocus={!category}
            accessibilityLabel="Category name"
          />

          <Text style={styles.label}>Colour</Text>
          <View style={styles.swatches}>
            {CATEGORY_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  setColor(c);
                  setCustomColor(c);
                  setError(null);
                }}
                style={[styles.swatch, { backgroundColor: c }, c === color && styles.swatchSelected]}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ selected: c === color }}
              >
                {c === color && <Ionicons name="checkmark" size={18} color="#fff" />}
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Custom colour</Text>
          <View style={styles.customColorRow}>
            <View style={[styles.customColorPreview, { backgroundColor: color }]} />
            <TextInput
              value={customColor}
              onChangeText={(value) => {
                const next = value.trim();
                setCustomColor(next);
                setError(null);
                if (/^#[0-9A-Fa-f]{6}$/.test(next)) setColor(next.toUpperCase());
              }}
              placeholder="#2563EB"
              placeholderTextColor={colors.textSubtle}
              maxLength={MAX_COLOR}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.customColorInput}
              accessibilityLabel="Custom category colour in hex"
            />
          </View>

          <Text style={styles.label}>Icon (optional)</Text>
          <View style={styles.swatches}>
            <Pressable onPress={() => setIcon(null)} style={[styles.iconBtn, icon === null && { borderColor: color }]} accessibilityLabel="No icon">
              <Text style={styles.none}>None</Text>
            </Pressable>
            {CATEGORY_ICONS.map((ic) => (
              <Pressable
                key={ic}
                onPress={() => setIcon(ic)}
                style={[styles.iconBtn, icon === ic && { borderColor: color, backgroundColor: `${color}1A` }]}
                accessibilityRole="button"
                accessibilityLabel={`Icon ${ic}`}
              >
                <Ionicons name={ic} size={20} color={icon === ic ? color : colors.textMuted} />
              </Pressable>
            ))}
          </View>

          <View style={styles.actions}>
            {category && <CustomButton title="Delete" icon="trash-outline" variant="danger" onPress={remove} disabled={busy} style={{ flex: 1 }} />}
            <CustomButton title={category ? 'Save' : 'Create'} icon="checkmark" onPress={save} loading={busy} style={{ flex: 2 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  title: { ...typography.heading, marginBottom: spacing.md },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: spacing.lg,
    maxWidth: '100%',
  },
  previewText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  label: { ...typography.label, marginBottom: spacing.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.lg },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { transform: [{ scale: 1.1 }] },
  customColorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  customColorPreview: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  customColorInput: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  iconBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  none: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
