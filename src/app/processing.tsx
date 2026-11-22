import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import ImagePreview from '@/components/ImagePreview';
import { OcrUnavailableError, recognizeText } from '@/services/ocrService';
import { extractContact } from '@/services/extractionService';
import { draftFromExtraction, joinOcrText, mergeBackSide } from '@/services/cardMerge';
import { scanSession } from '@/services/scanSession';
import type { ContactField, ExtractionResult, OcrResult } from '@/types/contact';

type Status = 'running' | 'done' | 'error';

interface SideResult {
  ocr: OcrResult | null;
  extraction: ExtractionResult | null;
}

const read = async (img: { uri: string; width: number; height: number }): Promise<SideResult> => {
  const ocr = await recognizeText(img.uri, img);
  return { ocr, extraction: ocr.text.trim() ? extractContact(ocr) : null };
};

/**
 * Screen 3 – Image Processing and OCR (+ Screen 4's extraction step).
 * Runs ML Kit on-device for the front and (P11) the optional back side,
 * merges them (front wins), then hands a draft to the review screen.
 * Back-only mode: adding a back side to an existing contact (targetContactId).
 */
export default function ProcessingScreen() {
  const { image, back, targetContactId } = scanSession.get();
  const batchPos = scanSession.batchPosition();
  const primary = image ?? back; // what must be readable for this screen to succeed
  const [status, setStatus] = useState<Status>('running');
  const [step, setStep] = useState<'front' | 'back'>(image ? 'front' : 'back');
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [frontResult, setFrontResult] = useState<SideResult | null>(null);
  const [backResult, setBackResult] = useState<SideResult | null>(null);
  const [backFailed, setBackFailed] = useState(false);

  const run = useCallback(async () => {
    if (!primary) {
      setStatus('error');
      setError('No image was selected.');
      return;
    }
    setStatus('running');
    setError(null);
    setBackFailed(false);
    try {
      if (image) {
        setStep('front');
        setFrontResult(await read(image));
      }
      if (back) {
        setStep('back');
        try {
          setBackResult(await read(back));
        } catch (e) {
          if (!image) throw e; // back-only mode: the back IS the scan
          if (e instanceof OcrUnavailableError) throw e;
          setBackFailed(true); // the front was read; carry on without the back's text
        }
      }
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setUnavailable(e instanceof OcrUnavailableError);
      setError(e instanceof Error ? e.message : 'Text recognition failed.');
    }
  }, [image, back, primary]);

  useEffect(() => {
    run();
  }, [run]);

  const goToReview = () => {
    const backDraft = draftFromExtraction(backResult?.extraction?.fields, null, backResult?.ocr?.text);
    backDraft.cardBackImagePath = back?.uri ?? null;

    if (targetContactId) {
      // Existing contact: the review screen merges this into the saved details.
      scanSession.setResult(backResult?.ocr ?? null, backDraft, backResult?.extraction?.lowConfidence ?? []);
      router.replace({ pathname: '/review-contact', params: { id: targetContactId, addBack: '1' } });
      return;
    }

    const frontDraft = draftFromExtraction(frontResult?.extraction?.fields, image?.uri ?? null, frontResult?.ocr?.text);
    const { merged, added } = mergeBackSide(frontDraft, backDraft);
    merged.cardBackImagePath = back?.uri ?? null;
    const low = new Set<ContactField>(frontResult?.extraction?.lowConfidence ?? []);
    for (const f of backResult?.extraction?.lowConfidence ?? []) if (added.includes(f)) low.add(f);
    const ocr: OcrResult | null = frontResult?.ocr ?? backResult?.ocr ?? null;
    scanSession.setResult(ocr && { ...ocr, text: merged.rawOcrText ?? '' }, merged, [...low]);
    router.replace('/review-contact');
  };

  const rawText = joinOcrText(frontResult?.ocr?.text, backResult?.ocr?.text) ?? '';
  const empty = status === 'done' && !rawText.trim();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {batchPos && (
        <View style={styles.batchPill}>
          <Ionicons name="layers-outline" size={14} color={colors.primaryDark} />
          <Text style={styles.batchText}>Card {batchPos.index} of {batchPos.total}</Text>
        </View>
      )}
      <View style={styles.images}>
        {image && <ImagePreview uri={image.uri} height={back ? 130 : 180} />}
        {back && <ImagePreview uri={back.uri} height={130} />}
      </View>

      {status === 'running' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.statusText}>
            {image && back ? `Reading the ${step} side…` : 'Reading text on your phone…'}
          </Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.banner}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.warning} />
          <Text style={styles.bannerText}>
            {unavailable ? `${error} You can still enter the details manually.` : error}
          </Text>
        </View>
      )}

      {status === 'done' && (
        <>
          <View style={[styles.banner, !empty && styles.bannerOk]}>
            <Ionicons
              name={empty ? 'alert-circle-outline' : 'checkmark-circle-outline'}
              size={22}
              color={empty ? colors.warning : colors.accent}
            />
            <Text style={styles.bannerText}>
              {empty
                ? 'No readable text was found. Try a sharper, well-lit photo, or enter the details manually.'
                  : 'Card scanned successfully. Check the detected details before saving.'}
            </Text>
          </View>
          {backFailed && (
            <View style={styles.banner}>
              <Ionicons name="information-circle-outline" size={22} color={colors.warning} />
              <Text style={styles.bannerText}>The back side couldn't be read, but its image will still be saved.</Text>
            </View>
          )}
        </>
      )}

      <View style={styles.actions}>
        {status === 'done' && (
          <CustomButton
            title={empty ? (targetContactId ? 'Save the image anyway' : 'Enter details manually') : 'Continue to Review'}
            icon="arrow-forward"
            onPress={goToReview}
          />
        )}
        {status === 'error' && (
          <>
            {!!primary && (
              <CustomButton title={targetContactId ? 'Save the image anyway' : 'Enter details manually'} icon="create-outline" onPress={goToReview} />
            )}
            {!!primary && !unavailable && <CustomButton title="Try again" icon="refresh" variant="outline" onPress={run} />}
          </>
        )}
        <CustomButton title="Choose another image" variant="ghost" onPress={() => router.back()} disabled={status === 'running'} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  images: { gap: spacing.sm },
  batchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  batchText: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  center: { alignItems: 'center', paddingVertical: spacing.xxl },
  statusText: { ...typography.body, color: colors.textMuted, marginTop: spacing.md },
  banner: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  bannerOk: { backgroundColor: colors.accentSoft },
  bannerText: { ...typography.body, flex: 1, lineHeight: 21 },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
});
