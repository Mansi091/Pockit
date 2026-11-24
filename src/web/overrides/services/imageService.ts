/**
 * Web version of imageService.ts (same exports).
 *
 * Browsers have no app file system, so card images are kept as JPEG data URLs
 * ("data:image/jpeg;base64,…") stored in the contact row, exactly where the
 * phone stores a file URI. Cloud backup uploads/downloads them as usual.
 * Resizing/rotation uses a <canvas>.
 */
const DEFAULT_MAX_DIMENSION = 2000;

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not open this image.'));
    img.src = uri;
  });
}

export async function prepareImage(
  uri: string,
  opts: { width?: number; height?: number; rotate?: number; maxDimension?: number; compress?: number } = {},
): Promise<PreparedImage> {
  const img = await loadImage(uri);
  const max = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const rotate = (((opts.rotate ?? 0) % 360) + 360) % 360;
  const sideways = rotate === 90 || rotate === 270;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  return { uri: canvas.toDataURL('image/jpeg', opts.compress ?? 0.9), width: canvas.width, height: canvas.height };
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
