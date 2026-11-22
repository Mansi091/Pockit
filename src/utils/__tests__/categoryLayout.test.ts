jest.mock('expo-crypto', () => ({ randomUUID: () => 'x', digestStringAsync: jest.fn(), CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
jest.mock('@/database/db', () => ({ getDb: jest.fn() }));

import { edgesToLines, packBubbles, ringLayout } from '@/utils/categoryLayout';
import { hexToUuid } from '@/database/categoryRepository';
import { validateCategoryColor, validateCategoryName } from '@/services/categoryService';

jest.mock('@/services/syncService', () => ({ requestSync: jest.fn() }));

const overlap = (a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 0.5;

describe('bubble packing', () => {
  const nodes = [
    { id: 'clients', count: 40 },
    { id: 'family', count: 10 },
    { id: 'expo', count: 20 },
    { id: 'empty', count: 0 },
  ];
  const placed = packBubbles(nodes, 360, 320);

  it('places every category inside the canvas without overlaps', () => {
    expect(placed).toHaveLength(4);
    for (const p of placed) {
      expect(p.x - p.r).toBeGreaterThanOrEqual(-0.5);
      expect(p.x + p.r).toBeLessThanOrEqual(360.5);
      expect(p.y - p.r).toBeGreaterThanOrEqual(-0.5);
      expect(p.y + p.r).toBeLessThanOrEqual(320.5);
    }
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(overlap(placed[i]!, placed[j]!)).toBe(false);
  });

  it('makes bubble AREA proportional to contact count', () => {
    const r = Object.fromEntries(placed.map((p) => [p.id, p.r]));
    expect((r.clients! / r.family!) ** 2).toBeCloseTo(4, 1);
    expect(r.empty).toBeGreaterThan(0); // empty categories are still visible
  });

  it('handles no categories', () => {
    expect(packBubbles([], 300, 300)).toEqual([]);
  });
});

describe('connections', () => {
  it('lays categories on a ring and draws thicker lines for more shared contacts', () => {
    const placed = ringLayout([{ id: 'a', count: 10 }, { id: 'b', count: 5 }, { id: 'c', count: 1 }], 300, 300);
    expect(placed[0]!.id).toBe('a');
    expect(placed[0]!.r).toBeGreaterThan(placed[2]!.r);
    const lines = edgesToLines([{ a: 'a', b: 'b', shared: 4 }, { a: 'a', b: 'c', shared: 1 }, { a: 'b', b: 'zzz', shared: 3 }], placed);
    expect(lines).toHaveLength(2); // edge to an unknown category is ignored
    expect(lines.find((l) => l.key === 'a|b')!.thickness).toBeGreaterThan(lines.find((l) => l.key === 'a|c')!.thickness);
    for (const l of lines) expect(l.length).toBeGreaterThan(0);
  });
});

describe('categories', () => {
  it('derives a stable UUID-shaped id for a contact↔category link', () => {
    const id = hexToUuid('a'.repeat(64));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(hexToUuid('0123456789abcdef0123456789abcdef')).toBe(hexToUuid('0123456789abcdef0123456789abcdef'));
  });

  it('validates names', () => {
    expect(validateCategoryName('  ')).toMatch(/name/);
    expect(validateCategoryName('x'.repeat(41))).toMatch(/40/);
    expect(validateCategoryName('Clients')).toBeNull();
  });

  it('validates category colours', () => {
    expect(validateCategoryColor('#2563EB')).toBeNull();
    expect(validateCategoryColor('blue')).toMatch(/hex/);
    expect(validateCategoryColor('#FFF')).toMatch(/hex/);
  });
});
