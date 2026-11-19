import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import ImagePreview from '@/components/ImagePreview';
import FormError from '@/components/FormError';
import { pickFromGalleryAndCrop, takePhotoAndCrop, type PickedImage } from '@/services/cameraService';
import { isDocumentScannerAvailable, scanCardAutomatically, ScannerUnavailableError } from '@/services/documentScannerService';
import { prepareImage } from '@/services/imageService';
import { scanSession } from '@/services/scanSession';
import { isOcrAvailable } from '@/services/ocrService';

type Source = 'auto' | 'camera' | 'gallery';

/**
 * Screen 2 – Scan Business Card.
 *  - Automatic (development build): Google ML Kit Document Scanner finds the card's
 *    corners, crops, straightens and enhances it; its own screen handles adjust/retake.
 *  - Manual fallback (Expo Go, or if auto fails): system camera / gallery → crop screen.
 * The preview always shows the image that will be saved with the contact.
 */
export default function ScanScreen() {
  const autoAvailable = isDocumentScannerAvailable();
  const [image, setImage] = useState(scanSession.get().image);
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState<Source | 'rotate' | null>(null);

  useFocusEffect(
    useCallback(() => {
      setImage(scanSession.get().image);
    }, []),
  );

  const accept = async (picked: PickedImage, from: Source) => {
    // Normalise: bake in orientation, cap size, JPEG — the working copy used for OCR and saving.
    const prepared = await prepareImage(picked.uri, { width: picked.width, height: picked.height });
    scanSession.setImage(prepared);
    setImage(prepared);
    setSource(from);
  };

  const run = async (from: Source) => {
    setBusy(from);
    try {
      if (from === 'auto') {
        const scanned = await scanCardAutomatically();
        if (scanned) await accept(scanned, 'auto');
      } else {
        const picked = from === 'camera' ? await takePhotoAndCrop() : await pickFromGalleryAndCrop();
        if (picked) await accept(picked, from);
      }
    } catch (e) {
      if (e instanceof ScannerUnavailableError) {
        Alert.alert('Automatic scan unavailable', `${e.message}\n\nYou can take a photo and crop it to the card instead.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take photo', onPress: () => run('camera') },
        ]);
      } else {
        Alert.alert('Could not use this image', e instanceof Error ? e.message : 'Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  const onRotate = async () => {
    if (!image) return;
    setBusy('rotate');
    try {
      const rotated = await prepareImage(image.uri, { rotate: 90, width: image.width, height: image.height });
      scanSession.setImage(rotated);
      setImage(rotated);
    } finally {
      setBusy(null);
    }
  };

  const onRetake = () => {
    scanSession.clear();
    setImage(null);
    if (source) run(source);
  };

  const smallImage = !!image && Math.max(image.width, image.height) < 700;

  // ── Preview ────────────────────────────────────────────────────────
  if (image) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Check the card</Text>
        <Text style={styles.subtitle}>Only the card should be visible, with all text sharp.</Text>

        <View style={styles.preview}>
          <ImagePreview uri={image.uri} height={220} />
          {source && (
            <View style={styles.badge}>
              <Ionicons name={source === 'auto' ? 'sparkles' : 'crop'} size={13} color={colors.primaryDark} />
              <Text style={styles.badgeText}>{source === 'auto' ? 'Auto-cropped' : 'Cropped manually'}</Text>
            </View>
          )}
        </View>

        {smallImage && (
          <FormError tone="info" message="This image is quite small, so some text may not be read. A closer photo works best." />
        )}
        {!isOcrAvailable() && (
          <FormError tone="info" message="Automatic text reading needs the Pockit app build (not Expo Go). You'll type the details instead." />
        )}

        <View style={styles.actions}>
          <CustomButton title="Use this card" icon="arrow-forward" onPress={() => router.push('/processing')} disabled={!!busy} />
          <View style={styles.row}>
            <CustomButton title="Rotate" icon="refresh" variant="outline" onPress={onRotate} loading={busy === 'rotate'} style={styles.half} />
            <CustomButton
              title={source === 'auto' ? 'Rescan' : 'Retake'}
              icon="camera-reverse-outline"
              variant="outline"
              onPress={onRetake}
              disabled={!!busy}
              style={styles.half}
            />
          </View>
          {source === 'auto' && (
            <CustomButton title="Not right? Crop it myself" icon="crop" variant="ghost" onPress={() => run('camera')} disabled={!!busy} />
          )}
        </View>
      </ScrollView>
    );
  }

  // ── Choose a capture method ────────────────────────────────────────
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add a business card</Text>
      <Text style={styles.subtitle}>
        {autoAvailable
          ? 'Pockit finds the card, crops away the background and straightens it for you.'
          : 'Take or pick a photo, then crop it so only the card is left.'}
      </Text>

      <View style={styles.illustration}>
        <View style={styles.cardShape}>
          <Ionicons name={autoAvailable ? 'scan' : 'crop'} size={34} color={colors.primary} />
        </View>
      </View>

      {!autoAvailable && (
        <FormError
          tone="info"
          message="Automatic card detection needs the Pockit app build (not Expo Go). Until then, drag the crop box to the card's edges."
        />
      )}

      <View style={styles.actions}>
        {autoAvailable ? (
          <>
            <CustomButton title="Scan card" icon="scan" onPress={() => run('auto')} loading={busy === 'auto'} disabled={!!busy} />
            <CustomButton title="Take photo & crop myself" icon="crop" variant="outline" onPress={() => run('camera')} loading={busy === 'camera'} disabled={!!busy} />
          </>
        ) : (
          <CustomButton title="Take photo" icon="camera-outline" onPress={() => run('camera')} loading={busy === 'camera'} disabled={!!busy} />
        )}
        <CustomButton title="Choose from gallery" icon="images-outline" variant="outline" onPress={() => run('gallery')} loading={busy === 'gallery'} disabled={!!busy} />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: typography.title,
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 22 },
  preview: { marginVertical: spacing.xl },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark },
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
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
});
