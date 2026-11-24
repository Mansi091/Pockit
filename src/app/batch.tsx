import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useNavigation, usePreventRemove } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import ImagePreview from '@/components/ImagePreview';
import EventModeBanner from '@/components/EventModeBanner';
import OptionSheet from '@/components/OptionSheet';
import { batchScan, needsAttention, saveAllReady, useBatch, type BatchItem } from '@/services/batchScan';
import { captureMany, type BatchSource } from '@/services/cardCapture';
import { isDocumentScannerAvailable, ScannerUnavailableError } from '@/services/documentScannerService';
import { scanSession } from '@/services/scanSession';
import { useWebLayout } from '@/web/hooks/useWebLayout';

type IconName = keyof typeof Ionicons.glyphMap;

const STATUS: Record<BatchItem['status'], { label: string; icon: IconName; color: string; bg: string }> = {
  waiting: { label: 'Waiting', icon: 'time-outline', color: colors.textMuted, bg: colors.surfaceMuted },
  reading: { label: 'Reading…', icon: 'sync-outline', color: '#1D4ED8', bg: '#EFF6FF' },
  ready: { label: 'Ready', icon: 'checkmark-circle-outline', color: '#3F5A33', bg: '#E8F1E9' },
  failed: { label: 'Could not read', icon: 'alert-circle-outline', color: colors.danger, bg: colors.dangerSoft },
  saving: { label: 'Saving…', icon: 'cloud-upload-outline', color: '#1D4ED8', bg: '#EFF6FF' },
  saved: { label: 'Saved', icon: 'checkmark-done', color: '#FFFFFF', bg: '#3F5A33' },
};

/**
 * Batch screen: every card from a multi-card scan / multi-photo upload.
 * Cards are read automatically one after another (status on each tile).
 * "Save all" saves complete cards; tap any card to check/edit and save it.
 */
export default function BatchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const items = useBatch();
  const { isWide } = useWebLayout();
  const [savingAll, setSavingAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sheet, setSheet] = useState(false);
  const allowLeave = useRef(false);

  const total = items.length;
  const read = items.filter((i) => i.status !== 'waiting' && i.status !== 'reading').length;
  const readingNow = items.some((i) => i.status === 'waiting' || i.status === 'reading');
  const ready = items.filter((i) => i.status === 'ready');
  const savable = ready.filter((i) => !needsAttention(i));
  const saved = items.filter((i) => i.status === 'saved').length;
  const unsaved = total - saved;

  // Warn before leaving with unsaved cards (back button, gesture, Android back).
  usePreventRemove(unsaved > 0 && !allowLeave.current, ({ data }) => {
    Alert.alert('Leave this batch?', `${unsaved} card(s) are not saved yet and will be discarded.`, [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          allowLeave.current = true;
          navigation.dispatch(data.action);
        },
      },
    ]);
  });
  // The batch ends when this screen closes.
  useEffect(() => () => batchScan.clear(), []);

  const review = (item: BatchItem) => {
    if (!item.draft) return;
    scanSession.setImage(item.image);
    scanSession.setResult(item.ocr ?? null, item.draft, item.lowConfidence ?? []);
    router.push({ pathname: '/review-contact', params: { batchItem: item.id } });
  };

  const onSaveAll = async () => {
    setSavingAll(true);
    try {
      const r = await saveAllReady();
      Alert.alert(
        r.saved ? `${r.saved} contact${r.saved === 1 ? '' : 's'} saved` : 'Nothing saved yet',
        r.needReview
          ? `${r.needReview} card${r.needReview === 1 ? ' needs' : 's need'} a quick check — tap ${r.needReview === 1 ? 'it' : 'them'} to review.`
          : 'All ready cards are saved.',
      );
    } finally {
      setSavingAll(false);
    }
  };

  const addMore = async (from: BatchSource) => {
    setAdding(true);
    try {
      const imgs = await captureMany(from, Math.max(1, 30 - total));
      if (imgs.length) batchScan.add(imgs);
    } catch (e) {
      Alert.alert(
        e instanceof ScannerUnavailableError ? 'Scanner unavailable' : 'Could not add cards',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setAdding(false);
    }
  };

  const finish = () => {
    allowLeave.current = true;
    batchScan.clear();
    router.dismissAll();
  };

  const confirmRemove = (item: BatchItem) =>
    Alert.alert('Remove this card from the batch?', 'It will not be saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => batchScan.remove(item.id) },
    ]);

  if (total === 0) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Stack.Screen options={{ title: 'Batch scan' }} />
        <Ionicons name="layers-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No cards in this batch</Text>
        <CustomButton title="Back to scanning" variant="outline" onPress={finish} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `Batch · ${total} card${total === 1 ? '' : 's'}` }} />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]}>
        <EventModeBanner />

        {/* Progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <Text style={styles.progressTitle}>
              {readingNow ? `Reading cards… ${read} of ${total}` : saved === total ? 'All cards saved' : `All ${total} cards read`}
            </Text>
            {readingNow && <ActivityIndicator color={colors.primary} />}
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${total ? Math.round((read / total) * 100) : 0}%` }]} />
          </View>
          <Text style={styles.progressSub}>
            {saved} saved · {savable.length} ready to save · {ready.length - savable.length + items.filter((i) => i.status === 'failed').length} need a check
          </Text>
        </View>

        {/* Cards */}
        <View style={[styles.grid, isWide && { gap: spacing.lg }]}>
          {items.map((item, index) => {
            const st = STATUS[item.status];
            const d = item.draft;
            const attention = item.status === 'ready' ? item.attention ?? needsAttention(item) : null;
            const tappable = item.status === 'ready' || item.status === 'failed';
            return (
              <Pressable
                key={item.id}
                onPress={() => (item.status === 'failed' ? batchScan.retry(item.id) : tappable ? review(item) : undefined)}
                disabled={!tappable}
                style={({ pressed, hovered }) => [
                  styles.tile,
                  isWide ? styles.tileWide : styles.tileNarrow,
                  attention && styles.tileAttention,
                  (pressed || hovered) && tappable && { borderColor: colors.textSubtle },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Card ${index + 1}, ${st.label}${d?.personName ? `, ${d.personName}` : ''}`}
              >
                <View>
                  <ImagePreview uri={item.image.uri} height={isWide ? 130 : 96} />
                  <View style={[styles.status, { backgroundColor: st.bg }]}>
                    {item.status === 'reading' || item.status === 'saving' ? (
                      <ActivityIndicator size="small" color={st.color} />
                    ) : (
                      <Ionicons name={st.icon} size={13} color={st.color} />
                    )}
                    <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                  {item.status !== 'saved' && item.status !== 'saving' && (
                    <Pressable onPress={() => confirmRemove(item)} hitSlop={8} style={styles.removeBtn} accessibilityLabel="Remove card">
                      <Ionicons name="close" size={15} color="#FFFFFF" />
                    </Pressable>
                  )}
                </View>
                <View style={styles.tileBody}>
                  {item.status === 'waiting' || item.status === 'reading' ? (
                    <Text style={styles.muted}>Card {index + 1}</Text>
                  ) : item.status === 'failed' ? (
                    <>
                      <Text style={[styles.muted, { color: colors.danger }]} numberOfLines={2}>{item.error}</Text>
                      <Text style={styles.action}>Tap to try again</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.name} numberOfLines={1}>{d?.personName || 'No name found'}</Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {[d?.designation, d?.companyName].filter(Boolean).join(' · ') || '—'}
                      </Text>
                      {!!d?.phones[0]?.number && <Text style={styles.muted} numberOfLines={1}>{d.phones[0].number}</Text>}
                      {attention ? (
                        <Text style={styles.attention} numberOfLines={2}>{attention}</Text>
                      ) : item.status === 'ready' ? (
                        <Text style={styles.action}>Tap to check & save</Text>
                      ) : null}
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.md }]}>
        <CustomButton
          title="Add more"
          icon="add"
          variant="outline"
          onPress={() => setSheet(true)}
          loading={adding}
          disabled={savingAll || total >= 30}
          style={{ flex: 1 }}
        />
        {unsaved === 0 ? (
          <CustomButton title="Done" icon="checkmark" onPress={finish} style={{ flex: 2 }} />
        ) : (
          <CustomButton
            title={savable.length ? `Save all ready (${savable.length})` : readingNow ? 'Reading…' : 'Review the cards'}
            icon="checkmark-done"
            onPress={onSaveAll}
            loading={savingAll}
            disabled={!savable.length}
            style={{ flex: 2 }}
          />
        )}
      </View>

      <OptionSheet
        visible={sheet}
        title="Add more cards"
        options={(isDocumentScannerAvailable() ? ['scan', 'gallery'] : ['gallery']) as BatchSource[]}
        labelOf={(o) => (o === 'scan' ? 'Scan several cards' : 'Choose several photos')}
        onSelect={(o) => setTimeout(() => addMore(o), 250)}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyTitle: typography.heading,
  progressCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTitle: typography.heading,
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: spacing.md },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  progressSub: { ...typography.caption, marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tileNarrow: { width: '47.5%', flexGrow: 1 },
  tileWide: { width: 240, flexGrow: 1, maxWidth: 320 },
  tileAttention: { borderColor: '#F59E0B' },
  status: { position: 'absolute', left: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  removeBtn: { position: 'absolute', right: 8, top: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  tileBody: { padding: spacing.md, gap: 2, minHeight: 76 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  muted: { fontSize: 12, color: colors.textMuted },
  action: { fontSize: 12, fontWeight: '700', color: colors.accent, marginTop: 4 },
  attention: { fontSize: 12, fontWeight: '600', color: '#B45309', marginTop: 4 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
