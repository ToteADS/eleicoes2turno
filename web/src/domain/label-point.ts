import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

/**
 * Where an area's label goes: the pole of inaccessibility (the inside point farthest
 * from the border) of its largest polygon, found with the polylabel grid search
 * (Agafonkin, ISC). Unlike the centroid it always falls inside, even for crescent or
 * hollow shapes. `cells` sets the precision as a fraction of the polygon's size, so
 * the cost stays flat whatever the area's extent.
 */
export function labelPoint(f: Feature<Polygon | MultiPolygon>, cells = 20): [number, number] {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best: Position[][] = polys[0];
  let bestArea = -1;
  for (const p of polys) {
    const a = p[0] ? Math.abs(ringArea(p[0])) : 0;
    if (a > bestArea) { bestArea = a; best = p; }
  }
  return poleOfInaccessibility(best, cells);
}

function ringArea(ring: Position[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return s / 2;
}

interface Cell { x: number; y: number; h: number; d: number; max: number }

function cell(x: number, y: number, h: number, poly: Position[][]): Cell {
  const d = pointToPolygonDist(x, y, poly);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

export function poleOfInaccessibility(poly: Position[][], cells = 40): [number, number] {
  const outer = poly[0] ?? [];
  if (outer.length < 3) return outer.length ? [outer[0][0], outer[0][1]] : [0, 0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX;
  const hgt = maxY - minY;
  const size = Math.min(w, hgt);
  if (size === 0) return [minX + w / 2, minY + hgt / 2];
  const precision = Math.max(w, hgt) / cells;
  let h = size / 2;
  // max-first queue; a plain sorted array is plenty for the few hundred cells a coarse precision needs
  const queue: Cell[] = [];
  const push = (c: Cell) => {
    let lo = 0, hi = queue.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (queue[mid].max < c.max) lo = mid + 1; else hi = mid; }
    queue.splice(lo, 0, c);
  };
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) push(cell(x + h, y + h, h, poly));
  let best = centroidCell(poly);
  const bboxCell = cell(minX + w / 2, minY + hgt / 2, 0, poly);
  if (bboxCell.d > best.d) best = bboxCell;
  while (queue.length) {
    const c = queue.pop()!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2;
    push(cell(c.x - h, c.y - h, h, poly));
    push(cell(c.x + h, c.y - h, h, poly));
    push(cell(c.x - h, c.y + h, h, poly));
    push(cell(c.x + h, c.y + h, h, poly));
  }
  return [best.x, best.y];
}

function centroidCell(poly: Position[][]): Cell {
  const ring = poly[0];
  let area = 0, x = 0, y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    const f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f;
    y += (a[1] + b[1]) * f;
    area += f * 3;
  }
  return area === 0 ? cell(ring[0][0], ring[0][1], 0, poly) : cell(x / area, y / area, 0, poly);
}

/** Signed distance from a point to the polygon outline: positive inside, negative outside. */
function pointToPolygonDist(x: number, y: number, poly: Position[][]): number {
  let inside = false;
  let minSq = Infinity;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      minSq = Math.min(minSq, segDistSq(x, y, a, b));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minSq);
}

function segDistSq(px: number, py: number, a: Position, b: Position): number {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}
