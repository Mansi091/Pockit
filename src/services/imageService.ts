import { Image } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Card image handling.
 * - Working copies (for OCR / preview) live in the cache directory.
 * - Saved card images live in app document storage:
 *     <documents>/cards/<userId>/<contactId>.jpg
 *   One file per contact → no duplicates; deleting a contact deletes its file.
 * Only the file URI is stored in SQLite, never the image bytes.
 */
const DEFAULT_MAX_DIMENSION = 2000; // enough for OCR accuracy, keeps files ~300–700 KB

function cardsDir(userId: string): Directory {
  const dir = new Directory(Paths.document, 'cards', userId);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
}

/**
 * Normalises an image for OCR and storage: optional rotation, downscale large
 * photos, re-encode as JPEG. Re-encoding also bakes in the EXIF orientation,
 * so every later consumer sees the image the right way up.
 */
export async function prepareImage(
  uri: string,
  opts: { width?: number; height?: number; rotate?: number; maxDimension?: number; compress?: number } = {},
): Promise<PreparedImage> {
  const MAX_DIMENSION = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const ctx = ImageManipulator.manipulate(uri);
  if (opts.rotate) ctx.rotate(opts.rotate);
  const w = opts.width ?? 0;
  const h = opts.height ?? 0;
  const rotatedSideways = opts.rotate ? Math.abs(opts.rotate) % 180 === 90 : false;
  const outW = rotatedSideways ? h : w;
  const outH = rotatedSideways ? w : h;
  if (outW > MAX_DIMENSION || outH > MAX_DIMENSION) {
    ctx.resize(outW >= outH ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
  }
  const ref = await ctx.renderAsync();
  const result = await ref.saveAsync({ format: SaveFormat.JPEG, compress: opts.compress ?? 0.9 });
  return { uri: result.uri, width: result.width, height: result.height };
}

/**
 * Smaller copy of a card image for the phone's Contacts app. Android hands the
 * photo to the Contacts app inside an Intent (≈1 MB limit), so it must be small.
 */
export async function prepareContactPhoto(uri: string): Promise<string> {
  const size = await new Promise<{ width: number; height: number }>((resolve) =>
    Image.getSize(uri, (width, height) => resolve({ width, height }), () => resolve({ width: 4000, height: 4000 })),
  );
  return (await prepareImage(uri, { ...size, maxDimension: 720, compress: 0.85 })).uri;
}

/** Copies a working image into permanent storage for a contact. Returns the stored URI. */
export async function persistCardImage(userId: string, sourceUri: string, contactId: string): Promise<string> {
  const dest = new File(cardsDir(userId), `${contactId}.jpg`);
  if (dest.uri === sourceUri) return dest.uri; // already in place (editing an existing contact)
  if (dest.exists) dest.delete();
  await new File(sourceUri).copy(dest);
  return dest.uri;
}

/** Destination file for an image downloaded from cloud backup. */
export function cardImageFile(userId: string, contactId: string): File {
  return new File(cardsDir(userId), `${contactId}.jpg`);
}

export function imageExists(uri: string | null | undefined): boolean {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function deleteImage(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Missing or inaccessible files are not an error when deleting.
  }
}

export function deleteAllUserImages(userId: string): void {
  try {
    const dir = new Directory(Paths.document, 'cards', userId);
    if (dir.exists) dir.delete();
  } catch {
    // ignore
  }
}

/** Number of stored card images and their total size, for the Settings screen. */
export function storageUsage(userId: string): { files: number; bytes: number } {
  try {
    const dir = new Directory(Paths.document, 'cards', userId);
    if (!dir.exists) return { files: 0, bytes: 0 };
    let files = 0;
    let bytes = 0;
    for (const entry of dir.list()) {
      if (entry instanceof File) {
        files += 1;
        bytes += entry.size ?? 0;
      }
    }
    return { files, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}
