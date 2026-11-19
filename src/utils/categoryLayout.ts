import { hierarchy, pack } from 'd3-hierarchy';

/**
 * Pure layout maths for the Categories tab (unit-tested, no UI).
 * Bubble AREA is proportional to the number of contacts (radius ∝ √count), so
 * a category with 4× the people looks 4× bigger — not 16× as with radius ∝ count.
 */
export interface Node {
  id: string;
  count: number;
}

export interface Placed {
  id: string;
  x: number; // centre, in px
  y: number;
  r: number; // radius, in px
}

/** Empty categories still get a small visible bubble. */
const MIN_VALUE = 0.35;

export function packBubbles(nodes: Node[], width: number, height: number, padding = 8): Placed[] {
  if (!nodes.length || width <= 0 || height <= 0) return [];
  const root = hierarchy<{ children?: Node[]; id?: string; count?: number }>({ children: nodes })
    .sum((d) => (d.id ? Math.max(d.count ?? 0, MIN_VALUE) : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const size = Math.min(width, height);
  const packed = pack<{ children?: Node[]; id?: string; count?: number }>().size([size, size]).padding(padding)(root);
  const dx = (width - size) / 2;
  const dy = (height - size) / 2;
  return packed.leaves().map((l) => ({ id: l.data.id!, x: l.x + dx, y: l.y + dy, r: l.r }));
}

/**
 * Ring layout for the Connections view: categories evenly around a circle,
 * radius scaled by √count between minR and maxR. Largest category starts at the top.
 */
export function ringLayout(nodes: Node[], width: number, height: number, minR = 22, maxR = 46): Placed[] {
  if (!nodes.length) return [];
  const sorted = [...nodes].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((n) => n.count));
  const cx = width / 2;
  const cy = height / 2;
  if (sorted.length === 1) return [{ id: sorted[0]!.id, x: cx, y: cy, r: maxR }];
  const ring = Math.max(0, Math.min(width, height) / 2 - maxR - 6);
  return sorted.map((n, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / sorted.length;
    return {
      id: n.id,
      x: cx + ring * Math.cos(angle),
      y: cy + ring * Math.sin(angle),
      r: minR + (maxR - minR) * Math.sqrt(n.count / max),
    };
  });
}

export interface Edge {
  a: string;
  b: string;
  shared: number;
}

export interface Line {
  key: string;
  x: number; // left of the line's box (for a rotated View)
  y: number;
  length: number;
  angleDeg: number;
  thickness: number;
  shared: number;
  mid: { x: number; y: number };
}

/** Converts category-pair overlaps into drawable lines between bubble edges (thickness 2–8 px). */
export function edgesToLines(edges: Edge[], placed: Placed[]): Line[] {
  const at = new Map(placed.map((p) => [p.id, p]));
  const max = Math.max(1, ...edges.map((e) => e.shared));
  const out: Line[] = [];
  for (const e of edges) {
    const p = at.get(e.a);
    const q = at.get(e.b);
    if (!p || !q || e.shared <= 0) continue;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const dist = Math.hypot(dx, dy);
    const length = Math.max(0, dist - p.r - q.r);
    if (length < 4) continue;
    const ux = dx / dist;
    const uy = dy / dist;
    const sx = p.x + ux * p.r; // start at p's edge
    const sy = p.y + uy * p.r;
    const thickness = 2 + 6 * (e.shared / max);
    const mid = { x: sx + (ux * length) / 2, y: sy + (uy * length) / 2 };
    // A View rotates around its centre: place the box centred on the segment's midpoint.
    out.push({
      key: `${e.a}|${e.b}`,
      x: mid.x - length / 2,
      y: mid.y - thickness / 2,
      length,
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
      thickness,
      shared: e.shared,
      mid,
    });
  }
  return out;
}
