/**
 * Geometry for cropping a business card out of a photo (web scanner).
 * Points are {x, y}; "normalised" points are 0..1 of the image's width/height.
 * Pure functions — unit tested in __tests__/perspective.test.ts.
 */
export interface Pt {
  x: number;
  y: number;
}
/** Corners in reading order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];

/** Default crop box when nothing was detected: the middle of the image with a margin. */
export const DEFAULT_QUAD: Quad = [
  { x: 0.1, y: 0.15 },
  { x: 0.9, y: 0.15 },
  { x: 0.9, y: 0.85 },
  { x: 0.1, y: 0.85 },
];

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Sorts any 4 points into TL, TR, BR, BL (works for rotated cards too). */
export function orderCorners(points: Pt[]): Quad {
  const c = { x: points.reduce((s, p) => s + p.x, 0) / 4, y: points.reduce((s, p) => s + p.y, 0) / 4 };
  const byAngle = [...points].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
  // atan2 order starts at the left (−π) and goes clockwise on screen (y down): find the top-left start.
  let start = 0;
  let best = Infinity;
  byAngle.forEach((p, i) => {
    const s = p.x + p.y; // top-left has the smallest x + y
    if (s < best) {
      best = s;
      start = i;
    }
  });
  return [0, 1, 2, 3].map((k) => byAngle[(start + k) % 4]!) as Quad;
}

/** Twice the signed area (shoelace); positive = clockwise on screen. */
function area2(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

export const quadArea = (q: Quad) => Math.abs(area2(q)) / 2;

/** True when the quad is convex (no crossed or folded corners). */
export function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = q[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return sign !== 0;
}

/** Output size (px) of the straightened card for a quad in PIXEL coordinates, capped at `maxDim`. */
export function outputSize(q: Quad, maxDim = 2000): { width: number; height: number } {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Largest corner movement between two normalised quads (used to see if the card is held still). */
export function maxCornerShift(a: Quad, b: Quad): number {
  return Math.max(...a.map((p, i) => dist(p, b[i]!)));
}

/**
 * 3×3 homography H (row-major, h33 = 1) with H·from[i] ≅ to[i].
 * Solves the standard 8×8 linear system by Gaussian elimination.
 */
export function homography(from: Quad, to: Quad): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = to[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[pivot]![col]!)) pivot = r;
    [A[col], A[pivot]] = [A[pivot]!, A[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    const p = A[col]![col]!;
    if (Math.abs(p) < 1e-12) throw new Error('These corners do not form a usable shape.');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r]![col]! / p;
      if (!f) continue;
      for (let k = col; k < n; k++) A[r]![k]! -= f * A[col]![k]!;
      b[r]! -= f * b[col]!;
    }
  }
  const h = b.map((v, i) => v / A[i]![i]!);
  return [...h, 1];
}

export function applyHomography(H: number[], p: Pt): Pt {
  const w = H[6]! * p.x + H[7]! * p.y + H[8]!;
  return { x: (H[0]! * p.x + H[1]! * p.y + H[2]!) / w, y: (H[3]! * p.x + H[4]! * p.y + H[5]!) / w };
}

/**
 * Straightens the quad (PIXEL coordinates in `src`) into a width×height image.
 * Inverse mapping with bilinear sampling, so text stays sharp.
 */
export function warpImageData(
  src: { data: Uint8ClampedArray; width: number; height: number },
  quad: Quad,
  width: number,
  height: number,
): Uint8ClampedArray {
  const rect: Quad = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  const H = homography(rect, quad); // output pixel → source pixel
  const out = new Uint8ClampedArray(width * height * 4);
  const { data, width: sw, height: sh } = src;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = H[6]! * x + H[7]! * y + H[8]!;
      const sx = (H[0]! * x + H[1]! * y + H[2]!) / w;
      const sy = (H[3]! * x + H[4]! * y + H[5]!) / w;
      const x0 = Math.max(0, Math.min(sw - 2, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(sh - 2, Math.floor(sy)));
      const fx = Math.max(0, Math.min(1, sx - x0));
      const fy = Math.max(0, Math.min(1, sy - y0));
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = data[i00 + c]! * (1 - fx) + data[i10 + c]! * fx;
        const bottom = data[i01 + c]! * (1 - fx) + data[i11 + c]! * fx;
        out[o + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}
