import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import ImagePreview from '@/components/ImagePreview';
import FormError from '@/components/FormError';
import OptionSheet from '@/components/OptionSheet';
import EventModeBanner from '@/components/EventModeBanner';
import { isDocumentScannerAvailable, scanCardsAutomatically, ScannerUnavailableError } from '@/services/documentScannerService';
import { CAPTURE_LABEL, captureCard, captureSources, type CaptureSource, type CardImage } from '@/services/cardCapture';
import { prepareImage } from '@/services/imageService';
import { scanSession } from '@/services/scanSession';
import { isOcrAvailable } from '@/services/ocrService';

type Side = 'front' | 'back';
type Busy = `${Side}:${CaptureSource | 'rotate'}` | null;

/**
 * Screen 2 – Scan Business Card.
 *  - Automatic (development build): Google ML Kit Document Scanner finds the card's
 *    corners, crops, straightens and enhances it; its own screen handles adjust/retake.
 *  - Manual fallback (Expo Go, or if auto fails): system camera / gallery → crop screen.
 *  - P11: optional back side. Both sides are read; the front wins on conflicts.
 * The previews always show the images that will be saved with the contact.
 */
export default function ScanScreen() {
  const autoAvailable = isDocumentScannerAvailable();
  const [front, setFront] = useState<CardImage | null>(scanSession.get().image);
  const [back, setBack] = useState<CardImage | null>(scanSession.get().back);
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [backSheet, setBackSheet] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const s = scanSession.get();
      if (s.targetContactId || s.batch) scanSession.clear(); // leftover back-only / batch flow — start fresh
      setFront(scanSession.get().image);
      setBack(scanSession.get().back);
    }, []),
  );

  const store = (side: Side, img: CardImage | null) => {
    if (side === 'front') {
      scanSession.setImage(img);
      setFront(img);
    } else {
      scanSession.setBack(img);
      setBack(img);
    }
  };

  const run = async (side: Side, from: CaptureSource) => {
    setBusy(`${side}:${from}`);
    try {
      const img = await captureCard(from);
      if (img) {
        store(side, img);
        if (side === 'front') setSource(from);
      }
    } catch (e) {
      if (e instanceof ScannerUnavailableError) {
        Alert.alert('Automatic scan unavailable', `${e.message}\n\nYou can take a photo and crop it to the card instead.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take photo', onPress: () => run(side, 'camera') },
        ]);
      } else {
        Alert.alert('Could not use this image', e instanceof Error ? e.message : 'Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  // P12 batch: capture up to 20 cards in one go, then review them one after another.
  const [batchBusy, setBatchBusy] = useState(false);
  const runBatch = async () => {
    setBatchBusy(true);
    try {
      const scanned = await scanCardsAutomatically(20);
      if (!scanned.length) return;
      const prepared = [];
      for (const c of scanned) prepared.push(await prepareImage(c.uri, { width: c.width, height: c.height }));
      scanSession.startBatch(prepared);
      router.push('/processing');
    } catch (e) {
      Alert.alert(
        e instanceof ScannerUnavailableError ? 'Automatic scan unavailable' : 'Could not scan the cards',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setBatchBusy(false);
    }
  };

  const rotate = async (side: Side) => {
    const img = side === 'front' ? front : back;
    if (!img) return;
    setBusy(`${side}:rotate`);
    try {
      store(side, await prepareImage(img.uri, { rotate: 90, width: img.width, height: img.height }));
    } finally {
      setBusy(null);
    }
  };

  const onRetakeFront = () => {
    setFront(null);
    if (source) run('front', source);
  };

  const onSwap = () => {
    const f = front;
    const b = back;
    if (!f || !b) return;
    scanSession.setImage(b);
    scanSession.setBack(f);
    setFront(b);
    setBack(f);
  };

  const smallImage = !!front && Math.max(front.width, front.height) < 700;

  // ── Preview ────────────────────────────────────────────────────────
  if (front) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Check the card</Text>
        <Text style={styles.subtitle}>Only the card should be visible, with all text sharp.</Text>

        <View style={styles.preview}>
          <ImagePreview uri={front.uri} height={200} />
          <View style={styles.badges}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Front</Text>
            </View>
            {source && (
              <View style={styles.badge}>
                <Ionicons name={source === 'auto' ? 'sparkles' : 'crop'} size={12} color={colors.primaryDark} />
                <Text style={styles.badgeText}>{source === 'auto' ? 'Auto-cropped' : 'Cropped'}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.row}>
          <CustomButton title="Rotate" icon="refresh" variant="outline" onPress={() => rotate('front')} loading={busy === 'front:rotate'} disabled={!!busy} style={styles.half} />
          <CustomButton
            title={source === 'auto' ? 'Rescan' : 'Retake'}
            icon="camera-reverse-outline"
            variant="outline"
            onPress={onRetakeFront}
            disabled={!!busy}
            style={styles.half}
          />
        </View>
        {source === 'auto' && (
          <CustomButton title="Not right? Crop it myself" icon="crop" variant="ghost" onPress={() => run('front', 'camera')} disabled={!!busy} />
        )}

        {/* Back side (optional) */}
        <Text style={styles.sectionLabel}>Back side · optional</Text>
        {back ? (
          <>
            <View>
              <ImagePreview uri={back.uri} height={160} />
              <View style={styles.badges}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Back</Text>
                </View>
              </View>
            </View>
            <View style={[styles.row, { marginTop: spacing.sm }]}>
              <SmallAction icon="refresh" label="Rotate" onPress={() => rotate('back')} disabled={!!busy} />
              <SmallAction icon="camera-reverse-outline" label="Replace" onPress={() => setBackSheet(true)} disabled={!!busy} />
              <SmallAction icon="swap-vertical" label="Swap sides" onPress={onSwap} disabled={!!busy} />
              <SmallAction icon="trash-outline" label="Remove" danger onPress={() => store('back', null)} disabled={!!busy} />
            </View>
          </>
        ) : (
          <Pressable
            onPress={() => setBackSheet(true)}
            disabled={!!busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.addBack, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.addBackIcon}>
              <Ionicons name={busy?.startsWith('back') ? 'hourglass-outline' : 'add'} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addBackTitle}>Add back side</Text>
              <Text style={styles.addBackSub}>Extra numbers or an address on the back? Pockit reads both sides.</Text>
            </View>
          </Pressable>
        )}

        {smallImage && (
          <FormError tone="info" message="This image is quite small, so some text may not be read. A closer photo works best." />
        )}
        {!isOcrAvailable() && (
          <FormError tone="info" message="Automatic text reading needs the Pockit app build (not Expo Go). You'll type the details instead." />
        )}

        <View style={styles.actions}>
          <CustomButton
            title={back ? 'Read both sides' : 'Use this card'}
            icon="arrow-forward"
            onPress={() => router.push('/processing')}
            disabled={!!busy}
          />
        </View>

        <OptionSheet
          visible={backSheet}
          title={back ? 'Replace the back side' : 'Add the back side'}
          options={captureSources()}
          labelOf={(o) => CAPTURE_LABEL[o]}
          onSelect={(o) => setTimeout(() => run('back', o), 250) /* let the sheet close first */}
          onClose={() => setBackSheet(false)}
        />
      </ScrollView>
    );
  }

  // ── Choose a capture method ────────────────────────────────────────
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <EventModeBanner />
      <Text style={styles.title}>Someone new? Pockit them.</Text>
      <Text style={styles.subtitle}>
        {autoAvailable
          ? 'Pockit finds the card, crops away the background and straightens it for you. Start with the front.'
          : 'Scan a card, then check the details. It all starts with a good hello.'}
      </Text>

      <View style={styles.illustration}>
        <View style={styles.cardShape}>
          <Ionicons name={autoAvailable ? 'scan' : 'crop'} size={34} color={colors.primary} />
        </View>
      </View>

      {!autoAvailable && (
        <FormError
          tone="info"
          message={
            Platform.OS === 'web'
              ? 'Use your webcam or upload a photo of the card. Pockit reads it for you. On the website, the image is sent securely to our server to be read.'
              : "Automatic card detection needs the Pockit app build (not Expo Go). Until then, drag the crop box to the card's edges."
          }
        />
      )}

      <View style={styles.actions}>
        {autoAvailable ? (
          <>
            <CustomButton title="Scan card" icon="scan" onPress={() => run('front', 'auto')} loading={busy === 'front:auto'} disabled={!!busy || batchBusy} />
            <CustomButton
              title="Scan several cards"
              icon="layers-outline"
              variant="secondary"
              onPress={runBatch}
              loading={batchBusy}
              disabled={!!busy}
            />
            <Text style={styles.batchHint}>Several cards: scan them one after another (up to 20), then check each before it's saved.</Text>
            <CustomButton title="Take photo & crop myself" icon="crop" variant="outline" onPress={() => run('front', 'camera')} loading={busy === 'front:camera'} disabled={!!busy || batchBusy} />
          </>
        ) : (
          <CustomButton title={Platform.OS === 'web' ? 'Scan with webcam' : 'Take photo'} icon={Platform.OS === 'web' ? 'videocam-outline' : 'camera-outline'} onPress={() => run('front', 'camera')} loading={busy === 'front:camera'} disabled={!!busy} />
        )}
        <CustomButton title={Platform.OS === 'web' ? 'Upload a photo' : 'Choose from gallery'} icon={Platform.OS === 'web' ? 'cloud-upload-outline' : 'images-outline'} variant="outline" onPress={() => run('front', 'gallery')} loading={busy === 'front:gallery'} disabled={!!busy} />
        <CustomButton
          title="Enter details manually"
          icon="create-outline"
          variant="ghost"
          onPress={() => {
            scanSession.clear();
            router.push('/review-contact');
          }}
        />
      </View>
    </ScrollView>
  );
}

function SmallAction({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.smallAction, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.smallActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: typography.title,
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 22 },
  preview: { marginTop: spacing.lg, marginBottom: spacing.sm },
  badges: { position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark },
  sectionLabel: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  addBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  addBackIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBackTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  addBackSub: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  smallAction: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallActionText: { fontSize: 12, fontWeight: '600' },
  illustration: { alignItems: 'center', marginVertical: spacing.xxl },
  cardShape: {
    width: 220,
    height: 126,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  batchHint: { ...typography.caption, textAlign: 'center', marginTop: -2, marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
});
