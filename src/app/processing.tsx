import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import ImagePreview from '@/components/ImagePreview';
import { OcrUnavailableError, recognizeText } from '@/services/ocrService';
import { extractContact } from '@/services/extractionService';
import { scanSession } from '@/services/scanSession';
import { splitLegacyList, textToPhoneDrafts } from '@/utils/phone';
import type { ContactInput, ExtractionResult, OcrResult } from '@/types/contact';

type Status = 'running' | 'done' | 'error';

/**
 * Screen 3 – Image Processing and OCR (+ Screen 4's extraction step).
 * Runs ML Kit on-device, shows progress/errors and the raw text, extracts
 * structured fields, then hands a draft to the review screen.
 */
export default function ProcessingScreen() {
  const image = scanSession.get().image;
  const [status, setStatus] = useState<Status>('running');
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const run = useCallback(async () => {
    if (!image) {
      setStatus('error');
      setError('No image was selected.');
      return;
    }
    setStatus('running');
    setError(null);
    try {
      const result = await recognizeText(image.uri, image);
      setOcr(result);
      setExtraction(result.text.trim() ? extractContact(result) : null);
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setUnavailable(e instanceof OcrUnavailableError);
      setError(e instanceof Error ? e.message : 'Text recognition failed.');
    }
  }, [image]);

  useEffect(() => {
    run();
  }, [run]);

  const goToReview = () => {
    const fields = extraction?.fields;
    const draft: ContactInput = {
      personName: fields?.personName ?? '',
      companyName: fields?.companyName ?? null,
      designation: fields?.designation ?? null,
      phones: textToPhoneDrafts(fields?.phone),
      emails: splitLegacyList(fields?.email).map((address, i) => ({ label: i === 0 ? 'work' : 'personal', address })),
      website: fields?.website ?? null,
      address: fields?.address ?? null,
      cardImagePath: image?.uri ?? null,
      rawOcrText: ocr?.text || null,
    };
    scanSession.setResult(ocr, draft, extraction?.lowConfidence ?? []);
    router.replace('/review-contact');
  };

  const found = extraction
    ? Object.entries(extraction.fields).filter(([, v]) => !!v).length
    : 0;
  const empty = status === 'done' && !ocr?.text.trim();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ImagePreview uri={image?.uri} height={180} />

      {status === 'running' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.statusText}>Reading text on your phone…</Text>
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
                : `Read ${ocr!.lines.length} line(s) and identified ${found} field(s)${ocr!.rotation ? ` (image was rotated ${ocr!.rotation}°)` : ''}. You'll review everything next.`}
            </Text>
          </View>
          {!empty && (
            <>
              <CustomButton
                title={showRaw ? 'Hide raw OCR text' : 'Show raw OCR text'}
                variant="ghost"
                icon="document-text-outline"
                onPress={() => setShowRaw((v) => !v)}
              />
              {showRaw && (
                <View style={styles.rawBox}>
                  <Text style={styles.rawText} selectable>
                    {ocr!.text}
                  </Text>
                </View>
              )}
            </>
          )}
        </>
      )}

      <View style={styles.actions}>
        {status === 'done' && (
          <CustomButton title={empty ? 'Enter details manually' : 'Continue to Review'} icon="arrow-forward" onPress={goToReview} />
        )}
        {status === 'error' && (
          <>
            {!!image && <CustomButton title="Enter details manually" icon="create-outline" onPress={goToReview} />}
            {!!image && !unavailable && <CustomButton title="Try again" icon="refresh" variant="outline" onPress={run} />}
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
  rawBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  rawText: { fontFamily: 'monospace', fontSize: 13, color: colors.text },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
});
