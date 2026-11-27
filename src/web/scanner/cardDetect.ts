import { outputSize, warpImageData, type Quad } from '@/web/scanner/perspective';
import { WORKER_SOURCE } from '@/web/scanner/cardDetectWorker';

/**
 * Website card detection + straightening.
 *
 *  • detectCard(): finds the business card's 4 corners. OpenCV.js runs in a
 *    background Web Worker (web/scanner/cardDetectWorker.ts), so loading its
 *    ~10 MB never freezes the page. If it can't load, detection returns null
 *    and the user drags the corners themselves.
 *  • cropCard(): straightens the chosen corners into a flat card image with
 *    our own perspective maths (web/scanner/perspective.ts).
 *
 * Used only by the web scanner (web/components/WebCardScanner).
 */
const DETECT_MAX = 640; // detection runs on a small copy for speed
const DETECTOR_START_TIMEOUT_MS = 15_000;

let worker: Worker | null = null;
let readyPromise: Promise<boolean> | null = null;
let nextId = 1;
const pending = new Map<number, (q: Quad | null) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; id?: number; quad?: Quad | null };
      if (msg.type === 'result' && msg.id !== undefined) {
        pending.get(msg.id)?.(msg.quad ?? null);
        pending.delete(msg.id);
      }
    };
    return worker;
  } catch {
    return null;
  }
}

/** Starts loading OpenCV in the background. Resolves true when detection is ready. */
export function loadDetector(): Promise<boolean> {
  if (readyPromise) return readyPromise;
  const w = getWorker();
  if (!w) return Promise.resolve(false);
  readyPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      w.removeEventListener('message', onMsg);
      w.removeEventListener('error', onError);
      if (!ok) {
        w.terminate();
        if (worker === w) worker = null;
      }
      resolve(ok);
    };
    const onMsg = (e: MessageEvent) => {
      const t = (e.data as { type?: string })?.type;
      if (t === 'ready' || t === 'failed') finish(t === 'ready');
    };
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), DETECTOR_START_TIMEOUT_MS);
    w.addEventListener('message', onMsg);
    w.addEventListener('error', onError);
    w.postMessage({ type: 'init' });
  }).then((ok) => {
    if (!ok) readyPromise = null; // allow a retry next time the scanner opens
    return ok;
  });
  return readyPromise;
}

type Source = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

function sizeOf(src: Source): { w: number; h: number } {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight };
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight };
  return { w: src.width, h: src.height };
}

/**
 * Finds the card. Resolves its corners NORMALISED (0..1 of the source size),
 * ordered TL, TR, BR, BL — or null when no convincing card shape is found.
 */
export async function detectCard(source: Source): Promise<Quad | null> {
  const w = getWorker();
  const { w: sw, h: sh } = sizeOf(source);
  if (!w || !sw || !sh) return null;
  const scale = Math.min(1, DETECT_MAX / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, 4000);
    pending.set(id, (q) => {
      clearTimeout(timer);
      resolve(q);
    });
    w.postMessage({ type: 'detect', id, image }, [image.data.buffer]);
  });
}

/**
 * Straightens the card: `quad` is NORMALISED (0..1) on `image`.
 * Returns a JPEG data URL of the flat card.
 */
export function cropCard(image: HTMLImageElement | HTMLCanvasElement, quad: Quad, maxDim = 2000): { uri: string; width: number; height: number } {
  const sourceW = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const sourceH = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  // Photos from recent iPhones can exceed 40 MP. Bound the intermediate canvas
  // before getImageData (four bytes per pixel) to avoid Safari tab memory kills.
  const sourceScale = Math.min(1, 2400 / Math.max(sourceW, sourceH));
  const w = Math.max(1, Math.round(sourceW * sourceScale));
  const h = Math.max(1, Math.round(sourceH * sourceScale));
  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  const fctx = full.getContext('2d', { willReadFrequently: true });
  if (!fctx) throw new Error('This browser cannot process images.');
  fctx.drawImage(image, 0, 0, w, h);
  const px = quad.map((p) => ({ x: p.x * (w - 1), y: p.y * (h - 1) })) as Quad;
  const size = outputSize(px, maxDim);
  const pixels = warpImageData(fctx.getImageData(0, 0, w, h), px, size.width, size.height);
  const out = document.createElement('canvas');
  out.width = size.width;
  out.height = size.height;
  const octx = out.getContext('2d')!;
  const imageData = octx.createImageData(size.width, size.height);
  imageData.data.set(pixels);
  octx.putImageData(imageData, 0, 0);
  return { uri: out.toDataURL('image/jpeg', 0.92), width: size.width, height: size.height };
}
