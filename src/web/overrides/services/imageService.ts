/**
 * Web version of imageService.ts (same exports).
 *
 * Browsers have no app file system, so card images are kept as JPEG data URLs
 * ("data:image/jpeg;base64,…") stored in the contact row, exactly where the
 * phone stores a file URI. Cloud backup uploads/downloads them as usual.
 * Resizing/rotation uses a <canvas>.
 */
const DEFAULT_MAX_DIMENSION = 2000;
const MAX_BASE64_LENGTH = 5_500_000; // leaves room for JSON/request overhead below the Edge Function limit

export type ImagePreparationStage = 'loading' | 'decoding' | 'canvas' | 'jpeg';

/** Safe to show to users: this message never includes the image URI or its contents. */
export class ImagePreparationError extends Error {
  constructor(readonly stage: ImagePreparationStage, message: string) {
    super(message);
    this.name = 'ImagePreparationError';
  }
}

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    // Blob and data URLs are local to this page. Setting crossOrigin on them can
    // make Safari reject a perfectly readable photo; only remote URLs need it.
    if (/^https?:/i.test(uri)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new ImagePreparationError('decoding', 'The selected photo could not be decoded. Try exporting it as JPEG.'));
        return;
      }
      resolve(img);
    };
    img.onerror = () =>
      reject(
        new ImagePreparationError(
          'decoding',
          'Safari could not open this photo. If it is HEIC/HEIF, export or share it as JPEG, then upload it again.',
        ),
      );
    img.src = uri;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): string {
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  } catch {
    throw new ImagePreparationError('canvas', 'Safari could not process this photo. Try a smaller image or export it as JPEG.');
  }
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/i.test(dataUrl)) {
    throw new ImagePreparationError('jpeg', 'Safari could not create a JPEG from this photo. Try exporting it as JPEG and upload it again.');
  }
  return dataUrl;
}

export async function prepareImage(
  uri: string,
  opts: { width?: number; height?: number; rotate?: number; maxDimension?: number; compress?: number; maxBase64Length?: number } = {},
): Promise<PreparedImage> {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new ImagePreparationError('loading', 'No photo was provided. Choose or capture a card photo and try again.');
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(uri);
  } catch (error) {
    if (error instanceof ImagePreparationError) throw error;
    throw new ImagePreparationError('loading', 'Could not load the selected photo. Please choose it again.');
  }
  const max = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const rotate = (((opts.rotate ?? 0) % 360) + 360) % 360;
  const sideways = rotate === 90 || rotate === 270;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const maxBase64Length = opts.maxBase64Length ?? MAX_BASE64_LENGTH;
  const baseQuality = opts.compress ?? 0.88;
  // Start with a readable 2000px image. If the card is unusually detailed or
  // noisy, lower JPEG quality and then dimensions before giving up.
  const dimensionScales = [1, 0.88, 0.76, 0.64, 0.52];
  const qualities = [baseQuality, Math.min(baseQuality, 0.82), Math.min(baseQuality, 0.74), 0.66];
  let sawCanvasFailure = false;
  for (const dimensionScale of dimensionScales) {
    const outW = Math.max(1, Math.round(w * dimensionScale));
    const outH = Math.max(1, Math.round(h * dimensionScale));
    const canvas = document.createElement('canvas');
    canvas.width = sideways ? outH : outW;
    canvas.height = sideways ? outW : outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImagePreparationError('canvas', 'This browser cannot process photos. Try another browser or a smaller image.');
    try {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotate * Math.PI) / 180);
      // HTMLImageElement decoders in current Safari apply the source EXIF
      // orientation before drawImage; this bakes that orientation into JPEG.
      ctx.drawImage(img, -outW / 2, -outH / 2, outW, outH);
    } catch {
      throw new ImagePreparationError('canvas', 'Safari could not draw this photo. Try exporting it as JPEG and uploading it again.');
    }
    for (const quality of [...new Set(qualities)]) {
      let jpeg: string;
      try {
        jpeg = canvasToJpeg(canvas, quality);
      } catch (error) {
        if (error instanceof ImagePreparationError && error.stage === 'canvas') {
          sawCanvasFailure = true;
          break; // lower dimensions can help Safari allocate an encoder buffer
        }
        throw error;
      }
      const base64Length = jpeg.slice(jpeg.indexOf(',') + 1).length;
      if (base64Length <= maxBase64Length) {
        return { uri: jpeg, width: canvas.width, height: canvas.height };
      }
    }
  }
  throw new ImagePreparationError(
    sawCanvasFailure ? 'canvas' : 'jpeg',
    'This photo is too large to process safely. Please crop it closer to the card or export a smaller JPEG and try again.',
  );
}

/** Not used on the web (no phone Contacts app), kept for the shared interface. */
export async function prepareContactPhoto(uri: string): Promise<string> {
  return (await prepareImage(uri, { maxDimension: 720, compress: 0.85 })).uri;
}

export const BACK_SUFFIX = '_back';

/** Images already live inside the row as data URLs; make sure it IS one (not a temporary blob: URL). */
export async function persistCardImage(_userId: string, sourceUri: string, _contactId: string): Promise<string> {
  if (sourceUri.startsWith('data:')) return sourceUri;
  return (await prepareImage(sourceUri)).uri;
}

export function imageExists(uri: string | null | undefined): boolean {
  return !!uri;
}

export function deleteImage(_uri: string | null | undefined): void {
  // Nothing to delete: the image disappears with its row.
}

export function deleteAllUserImages(_userId: string): void {
  // Nothing to delete: images are inside the database rows.
}

export function storageUsage(_userId: string): { files: number; bytes: number } {
  return { files: 0, bytes: 0 };
}

/** Blob → data URL (used when downloading a card image from cloud backup). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
