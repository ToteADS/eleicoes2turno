import bbox from '@turf/bbox';
import bboxClip from '@turf/bbox-clip';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { AreaResult } from './types';

export type Side = 'L' | 'R' | 'X';

/** Lula's share of the two-candidate vote, or null while there is nothing to show. */
export function share(r: AreaResult | undefined): number | null {
  if (!r || !r.released || r.l + r.f === 0) return null;
  return r.l / (r.l + r.f);
}

export function leaderSide(r: AreaResult | undefined): Side {
  const s = share(r);
  if (s === null || s === 0.5) return 'X'; // an exact tie has no leader
  return s > 0.5 ? 'L' : 'R';
}

function nonEmpty(g: Polygon | MultiPolygon): boolean {
  if (g.type === 'Polygon') return g.coordinates.length > 0 && g.coordinates[0].length >= 4;
  g.coordinates = g.coordinates.filter((p) => p.length > 0 && p[0].length >= 4);
  return g.coordinates.length > 0;
}

/**
 * Cuts an area with a north-south line at Lula's share of its bounding-box width:
 * the west part (side 'L') is red, the east part (side 'R') is blue.
 * Without a share the area comes back whole with side 'X' (grey).
 */
export function splitFeature(
  f: Feature<Polygon | MultiPolygon>,
  lulaShare: number | null,
  props: Record<string, unknown>,
): Feature<Polygon | MultiPolygon>[] {
  if (lulaShare === null || Number.isNaN(lulaShare)) {
    return [{ type: 'Feature', geometry: f.geometry, properties: { ...props, side: 'X' } }];
  }
  const [x0, y0, x1, y1] = bbox(f);
  const sx = x0 + (x1 - x0) * lulaShare;
  const out: Feature<Polygon | MultiPolygon>[] = [];
  const west = bboxClip(f, [x0 - 1, y0 - 1, sx, y1 + 1]).geometry as Polygon | MultiPolygon;
  const east = bboxClip(f, [sx, y0 - 1, x1 + 1, y1 + 1]).geometry as Polygon | MultiPolygon;
  if (lulaShare > 0 && nonEmpty(west)) out.push({ type: 'Feature', geometry: west, properties: { ...props, side: 'L' } });
  if (lulaShare < 1 && nonEmpty(east)) out.push({ type: 'Feature', geometry: east, properties: { ...props, side: 'R' } });
  return out;
}
