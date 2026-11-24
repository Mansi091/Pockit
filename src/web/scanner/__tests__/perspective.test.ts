import {
  applyHomography,
  DEFAULT_QUAD,
  homography,
  isConvex,
  maxCornerShift,
  orderCorners,
  outputSize,
  quadArea,
  warpImageData,
  type Quad,
} from '@/web/scanner/perspective';

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('orderCorners', () => {
  it('orders shuffled corners as TL, TR, BR, BL', () => {
    const q = orderCorners([
      { x: 90, y: 80 },
      { x: 10, y: 10 },
      { x: 12, y: 78 },
      { x: 95, y: 5 },
    ]);
    expect(q).toEqual([
      { x: 10, y: 10 },
      { x: 95, y: 5 },
      { x: 90, y: 80 },
      { x: 12, y: 78 },
    ]);
  });

  it('handles a tilted card', () => {
    const q = orderCorners([
      { x: 50, y: 0 },
      { x: 100, y: 40 },
      { x: 50, y: 80 },
      { x: 0, y: 40 },
    ]);
    expect(isConvex(q)).toBe(true);
    expect(quadArea(q)).toBeCloseTo(4000);
  });
});

describe('homography', () => {
  it('maps each corner exactly', () => {
    const from: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
    const to: Quad = [{ x: 12, y: 30 }, { x: 410, y: 18 }, { x: 430, y: 280 }, { x: 25, y: 300 }];
    const H = homography(from, to);
    from.forEach((p, i) => {
      const m = applyHomography(H, p);
      close(m.x, to[i]!.x);
      close(m.y, to[i]!.y);
    });
  });

  it('rejects degenerate corners', () => {
    const line: Quad = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(() => homography(DEFAULT_QUAD, line)).toThrow();
  });
});

describe('warpImageData', () => {
  it('extracts the quad region (identity crop of a 2-colour image)', () => {
    // 4×2 image: left half red, right half blue
    const w = 4;
    const h = 2;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data.set(x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], i);
      }
    const out = warpImageData({ data, width: w, height: h }, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 2, 2);
    expect(Array.from(out.slice(0, 4))).toEqual([255, 0, 0, 255]); // inside the red half
  });
});

describe('helpers', () => {
  it('sizes the output from the longest sides, capped', () => {
    const q: Quad = [{ x: 0, y: 0 }, { x: 3400, y: 0 }, { x: 3400, y: 2000 }, { x: 0, y: 2000 }];
    expect(outputSize(q, 2000)).toEqual({ width: 2000, height: 1176 });
  });

  it('measures corner movement', () => {
    const moved = DEFAULT_QUAD.map((p) => ({ x: p.x + 0.01, y: p.y })) as Quad;
    expect(maxCornerShift(DEFAULT_QUAD, moved)).toBeCloseTo(0.01);
  });

  it('detects folded quads', () => {
    expect(isConvex(DEFAULT_QUAD)).toBe(true);
    expect(isConvex([DEFAULT_QUAD[0], DEFAULT_QUAD[2], DEFAULT_QUAD[1], DEFAULT_QUAD[3]])).toBe(false);
  });
});
