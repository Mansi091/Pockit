import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';
import { registerWebcamHost, type ScannerRequest, type WebcamShot } from '@/web/scanner/webcam';
import { cropCard, detectCard, loadDetector } from '@/web/scanner/cardDetect';
import { DEFAULT_QUAD, maxCornerShift, type Quad } from '@/web/scanner/perspective';

/**
 * Website card scanner (web only, mounted once in the root layout).
 *
 * CAMERA: live webcam; OpenCV finds the card every ~¼ s and outlines it in
 *   green. Held still for about a second → captured automatically (can be
 *   switched off), or press the shutter any time.
 * CROP:   the captured / uploaded photo with the card's 4 corners as
 *   draggable handles (pre-placed by detection). "Crop & use" straightens it.
 */
type Stage = 'camera' | 'crop';
type CamStatus = 'starting' | 'live' | 'error';

const DETECT_EVERY_MS = 250;
const STEADY_SHIFT = 0.025; // corners moving less than 2.5% of the frame…
const STEADY_TICKS = 4; // …for 4 detections in a row (~1 s) → auto-capture

export default function WebCardScanner() {
  // Phones / narrow windows: full-screen scanner with the main button always in view.
  const { width: winW, height: winH } = useWindowDimensions();
  const compact = winW < 700;
  // header ≈ 70, note ≈ 50, chips + button ≈ 140, padding ≈ 30
  const cropImageMax = Math.max(160, winH - 290);
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<Stage>('camera');

  // camera
  const [camStatus, setCamStatus] = useState<CamStatus>('starting');
  const [camError, setCamError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [autoCapture, setAutoCapture] = useState(true);
  const [liveQuad, setLiveQuad] = useState<Quad | null>(null);
  const [steady, setSteady] = useState(0);
  const [cvState, setCvState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  // crop
  const [photo, setPhoto] = useState<string | null>(null);
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [detecting, setDetecting] = useState(false);
  const [autoFound, setAutoFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveRef = useRef<((shot: WebcamShot | null) => void) | null>(null);
  const cvReadyRef = useRef(false);
  const inFlightRef = useRef(false); // one detection at a time
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<number | null>(null);
  const lastQuadRef = useRef<Quad | null>(null);
  const steadyRef = useRef(0);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const finish = useCallback((shot: WebcamShot | null) => {
    stopCamera();
    setVisible(false);
    setPhoto(null);
    resolveRef.current?.(shot);
    resolveRef.current = null;
  }, []);

  // Register with the bridge.
  useEffect(() => {
    registerWebcamHost((req: ScannerRequest, resolve) => {
      resolveRef.current = resolve;
      setBusy(false);
      setLiveQuad(null);
      steadyRef.current = 0;
      setSteady(0);
      if (req.mode === 'camera') {
        setPhoto(null);
        setStage('camera');
      } else {
        setPhoto(req.uri);
        setQuad(DEFAULT_QUAD);
        setAutoFound(false);
        setStage('crop');
      }
      setVisible(true);
    });
    return () => registerWebcamHost(null);
  }, []);

  // Load OpenCV in the background whenever the scanner opens.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setCvState(cvReadyRef.current ? 'ready' : 'loading');
    loadDetector().then((ok) => {
      if (!live) return;
      cvReadyRef.current = ok;
      setCvState(ok ? 'ready' : 'unavailable');
    });
    return () => {
      live = false;
    };
  }, [visible]);

  // ── CAMERA ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || stage !== 'camera') return;
    let cancelled = false;
    (async () => {
      stopCamera();
      setCamStatus('starting');
      setCamError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(''), { name: 'NotSupported' });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setCamStatus('live');
      } catch (e) {
        const name = (e as { name?: string }).name;
        setCamError(
          name === 'NotAllowedError'
            ? 'Camera access is blocked. Click the camera icon in the address bar, allow the camera, then try again.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera was found on this computer. Close this and use "Upload a photo".'
              : 'The camera could not start. Close other apps using it and try again.',
        );
        setCamStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [visible, stage, facing]);

  const grabFrame = (): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    return c.toDataURL('image/jpeg', 0.95);
  };

  const capture = useCallback(
    (detected: Quad | null) => {
      const frame = grabFrame();
      if (!frame) return;
      stopCamera();
      setPhoto(frame);
      setQuad(detected ?? DEFAULT_QUAD);
      setAutoFound(!!detected);
      setStage('crop');
    },
    [],
  );

  // Live detection loop.
  useEffect(() => {
    if (!visible || stage !== 'camera' || camStatus !== 'live' || cvState !== 'ready') return;
    let active = true;
    const timer = setInterval(async () => {
      const v = videoRef.current;
      if (!v || !v.videoWidth || inFlightRef.current) return;
      inFlightRef.current = true;
      const q = await detectCard(v);
      inFlightRef.current = false;
      if (!active) return;
      setLiveQuad(q);
      const prev = lastQuadRef.current;
      steadyRef.current = q && prev && maxCornerShift(q, prev) < STEADY_SHIFT ? steadyRef.current + 1 : 0;
      lastQuadRef.current = q;
      setSteady(steadyRef.current);
      if (autoCapture && q && steadyRef.current >= STEADY_TICKS) {
        steadyRef.current = 0;
        capture(q);
      }
    }, DETECT_EVERY_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [visible, stage, camStatus, cvState, autoCapture, capture]);

  // ── CROP ───────────────────────────────────────────────────────────
  // Auto-detect on an uploaded photo (camera shots arrive with corners already).
  const runDetectOnPhoto = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !cvReadyRef.current) return;
    setDetecting(true);
    detectCard(img).then((q) => {
      if (q) setQuad(q);
      setAutoFound(!!q);
      setDetecting(false);
    });
  }, []);

  useEffect(() => {
    if (stage === 'crop' && photo && cvState === 'ready' && !autoFound) {
      const img = imgRef.current;
      if (img?.complete) runDetectOnPhoto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, photo, cvState]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const i = dragRef.current;
    const box = boxRef.current?.getBoundingClientRect();
    if (i === null || !box) return;
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    setQuad((q) => q.map((p, k) => (k === i ? { x, y } : p)) as Quad);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const startDrag = (i: number) => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    dragRef.current = i;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const useCrop = () => {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    setTimeout(() => {
      try {
        finish(cropCard(img, quad));
      } catch {
        setBusy(false);
      }
    }, 30);
  };

  /** Throw this photo away and go back to the live camera. */
  const rescan = () => {
    if (busy) return;
    setPhoto(null);
    setQuad(DEFAULT_QUAD);
    setAutoFound(false);
    setDetecting(false);
    setLiveQuad(null);
    lastQuadRef.current = null;
    steadyRef.current = 0;
    setSteady(0);
    setStage('camera');
  };

  const useWhole = () => {
    const img = imgRef.current;
    if (!img) return;
    finish({ uri: photo!, width: img.naturalWidth, height: img.naturalHeight });
  };

  // ── Rendering helpers (DOM, web only) ──────────────────────────────
  const quadPath = (q: Quad, mirror = false) =>
    q.map((p, i) => `${i ? 'L' : 'M'}${(mirror ? 1 - p.x : p.x) * 1000},${p.y * 1000}`).join(' ') + ' Z';

  const overlay = (q: Quad, opts: { mirror?: boolean; color: string; shade: boolean }) =>
    createElement(
      'svg',
      {
        viewBox: '0 0 1000 1000',
        preserveAspectRatio: 'none',
        style: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' },
        'aria-hidden': true,
      },
      opts.shade &&
        createElement('path', {
          d: `M0,0 H1000 V1000 H0 Z ${quadPath(q, opts.mirror)}`,
          fill: 'rgba(0,0,0,0.45)',
          fillRule: 'evenodd',
        }),
      createElement('path', {
        d: quadPath(q, opts.mirror),
        fill: 'none',
        stroke: opts.color,
        strokeWidth: 4,
        vectorEffect: 'non-scaling-stroke',
        strokeLinejoin: 'round',
      }),
    );

  const cameraHint =
    cvState === 'loading'
      ? 'Loading card detection…'
      : cvState === 'unavailable'
        ? 'Card detection is unavailable — press the shutter, then drag the corners.'
        : liveQuad
          ? autoCapture
            ? steady > 0
              ? 'Hold still…'
              : 'Card found — hold it steady'
            : 'Card found — press the shutter'
          : 'Show the whole card on a plain, darker surface';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => finish(null)}>
      <View style={[styles.backdrop, compact && { padding: 0 }]}>
        <View style={[styles.panel, compact && { maxWidth: undefined, height: winH, borderRadius: 0 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{stage === 'camera' ? 'Scan a card' : 'Adjust the corners'}</Text>
            <Pressable onPress={() => finish(null)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close scanner">
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {stage === 'camera' ? (
            <>
              <View style={[styles.stage, compact && { aspectRatio: undefined, flex: 1 }]}>
                {createElement('video', {
                  ref: videoRef,
                  autoPlay: true,
                  playsInline: true,
                  muted: true,
                  style: {
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    background: '#000',
                    transform: facing === 'user' ? 'scaleX(-1)' : undefined,
                  },
                })}
                {camStatus === 'live' && liveQuad && overlay(liveQuad, { mirror: facing === 'user', color: steady > 0 ? '#4ADE80' : '#A3E635', shade: true })}
                {camStatus === 'live' && (
                  <View pointerEvents="none" style={styles.hintWrap}>
                    <Text style={styles.hint}>{cameraHint}</Text>
                  </View>
                )}
                {camStatus === 'starting' && (
                  <View style={styles.center}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.centerText}>Starting camera… allow access if your browser asks.</Text>
                  </View>
                )}
                {camStatus === 'error' && (
                  <View style={styles.center}>
                    <Ionicons name="videocam-off-outline" size={36} color="#FFFFFF" />
                    <Text style={styles.centerText}>{camError}</Text>
                  </View>
                )}
              </View>
              <View style={styles.controls}>
                <View style={styles.autoRow}>
                  <Switch
                    value={autoCapture}
                    onValueChange={setAutoCapture}
                    trackColor={{ true: '#4ADE80', false: '#3F3F3F' }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel="Auto-capture"
                  />
                  <Text style={styles.autoText}>Auto-capture</Text>
                </View>
                <Pressable
                  onPress={() => capture(liveQuad)}
                  disabled={camStatus !== 'live'}
                  style={[styles.shutter, camStatus !== 'live' && { opacity: 0.4 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Capture card"
                >
                  <View style={styles.shutterInner} />
                </Pressable>
                <Pressable
                  onPress={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Switch camera"
                >
                  <Ionicons name="camera-reverse-outline" size={22} color="#FFFFFF" />
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.cropStage, compact && { flex: 1, minHeight: 0, padding: spacing.sm }]}>
                {photo &&
                  createElement(
                    'div',
                    { ref: boxRef, style: { position: 'relative', display: 'inline-block', maxWidth: '100%', touchAction: 'none', userSelect: 'none' } },
                    createElement('img', {
                      ref: imgRef,
                      src: photo,
                      alt: 'Card photo',
                      draggable: false,
                      onLoad: () => cvState === 'ready' && !autoFound && runDetectOnPhoto(),
                      // Phone: whatever height is left after the header, note and buttons.
                      style: { display: 'block', maxWidth: '100%', maxHeight: compact ? `${cropImageMax}px` : '62vh' },
                    }),
                    overlay(quad, { color: '#4ADE80', shade: true }),
                    ...quad.map((p, i) =>
                      createElement('div', {
                        key: i,
                        role: 'slider',
                        'aria-label': ['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner'][i],
                        onPointerDown: startDrag(i),
                        style: {
                          position: 'absolute',
                          left: `${p.x * 100}%`,
                          top: `${p.y * 100}%`,
                          width: 30,
                          height: 30,
                          marginLeft: -15,
                          marginTop: -15,
                          borderRadius: 15,
                          background: 'rgba(74,222,128,0.25)',
                          border: '3px solid #FFFFFF',
                          boxShadow: '0 0 0 2px #22C55E, 0 2px 8px rgba(0,0,0,0.5)',
                          cursor: 'grab',
                          touchAction: 'none',
                        },
                      }),
                    ),
                  )}
                {(detecting || busy) && (
                  <View style={styles.center} pointerEvents="none">
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.centerText}>{busy ? 'Straightening the card…' : 'Finding the card…'}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cropNote}>
                {autoFound
                  ? 'Card found automatically. Drag a corner if it is not exactly on the card’s edge.'
                  : cvState === 'loading'
                    ? 'Finding the card… you can also drag the 4 corners yourself.'
                    : 'Drag the 4 corners onto the card’s edges.'}
              </Text>
              {compact ? (
                // Phone: the way forward is always a big button at the bottom; the
                // other choices sit above it as small chips.
                <View style={styles.cropActionsCompact}>
                  <View style={styles.chipRow}>
                    <Pressable onPress={rescan} disabled={busy} style={styles.chip} accessibilityRole="button" accessibilityLabel="Rescan: take the photo again">
                      <Ionicons name="camera-outline" size={15} color="#FFFFFF" />
                      <Text style={styles.chipText}>Rescan</Text>
                    </Pressable>
                    <Pressable onPress={() => setQuad(DEFAULT_QUAD)} style={styles.chip} accessibilityRole="button">
                      <Text style={styles.chipText}>Reset</Text>
                    </Pressable>
                    {cvState === 'ready' && (
                      <Pressable onPress={runDetectOnPhoto} style={styles.chip} accessibilityRole="button">
                        <Text style={styles.chipText}>Detect</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={useWhole} style={styles.chip} accessibilityRole="button">
                      <Text style={styles.chipText}>Whole photo</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={useCrop} disabled={busy} style={[styles.primaryBtn, styles.primaryFull]} accessibilityRole="button">
                    <Ionicons name="crop" size={18} color={colors.primary} />
                    <Text style={styles.primaryText}>Crop & continue</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.cropActions}>
                  <Pressable
                    onPress={rescan}
                    disabled={busy}
                    style={[styles.ghostBtn, styles.rescanBtn]}
                    accessibilityRole="button"
                    accessibilityLabel="Rescan: take the photo again"
                  >
                    <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.ghostText}>Rescan</Text>
                  </Pressable>
                  <Pressable onPress={() => setQuad(DEFAULT_QUAD)} style={styles.ghostBtn} accessibilityRole="button">
                    <Text style={styles.ghostText}>Reset corners</Text>
                  </Pressable>
                  {cvState === 'ready' && (
                    <Pressable onPress={runDetectOnPhoto} style={styles.ghostBtn} accessibilityRole="button">
                      <Text style={styles.ghostText}>Detect again</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={useWhole} style={styles.ghostBtn} accessibilityRole="button">
                    <Text style={styles.ghostText}>Use whole photo</Text>
                  </Pressable>
                  <Pressable onPress={useCrop} disabled={busy} style={styles.primaryBtn} accessibilityRole="button">
                    <Ionicons name="crop" size={18} color={colors.primary} />
                    <Text style={styles.primaryText}>Crop & use</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  panel: { width: '100%', maxWidth: 980, backgroundColor: '#111311', borderRadius: radius.lg, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, paddingHorizontal: spacing.lg },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  stage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  hintWrap: { position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center' },
  hint: { color: '#FFFFFF', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: 'rgba(0,0,0,0.35)' },
  centerText: { color: '#FFFFFF', fontSize: 15, textAlign: 'center', maxWidth: 460, lineHeight: 22 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: 160 },
  autoText: { color: '#FFFFFF', fontSize: 14 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF' },
  cropStage: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', padding: spacing.md, minHeight: 300 },
  cropNote: { color: '#D4D8CC', fontSize: 14, textAlign: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  cropActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm, padding: spacing.lg },
  ghostBtn: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' },
  ghostText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  rescanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 'auto' },
  primaryBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: '#FFFFFF' },
  primaryText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  // phone layout
  cropActionsCompact: { gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)' },
  chipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  primaryFull: { justifyContent: 'center', minHeight: 52 },
});
