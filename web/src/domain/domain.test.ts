import type { Feature, Polygon } from 'geojson';
import { initialFilters, setCity, setCountry, setRegion, setUf, REGION_OF } from './filters';
import { leaderSide, share, splitFeature } from './split';
import { formatInt, formatPct } from './format';
import type { AreaResult } from './types';

const area = (l: number, f: number, released = true): AreaResult => ({
  el: 0, comp: 0, abst: 0, vv: l + f, vb: 0, vn: 0, l, f, st: 1, ts: 2, dg: '', hg: '', released,
});

describe('filters', () => {
  it('starts on all countries', () => {
    expect(initialFilters()).toEqual({ country: 'ALL', region: 'ALL', uf: null, city: null });
  });
  it('setUf moves region to the state region and clears the city', () => {
    const s = setUf({ country: 'BR', region: 'ALL', uf: null, city: '123' }, 'BA');
    expect(s).toEqual({ country: 'BR', region: 'NE', uf: 'BA', city: null });
  });
  it('setUf from another country switches to Brazil', () => {
    expect(setUf(setCountry(initialFilters(), 392), 'SP').country).toBe('BR');
  });
  it('setUf(null) keeps the region', () => {
    expect(setUf({ country: 'BR', region: 'S', uf: 'PR', city: null }, null)).toEqual({ country: 'BR', region: 'S', uf: null, city: null });
  });
  it('setCountry resets lower levels', () => {
    expect(setCountry({ country: 'BR', region: 'NE', uf: 'BA', city: '1' }, 392)).toEqual({ country: 392, region: 'ALL', uf: null, city: null });
  });
  it('setRegion clears uf and city', () => {
    expect(setRegion({ country: 'BR', region: 'NE', uf: 'BA', city: '1' }, 'S')).toEqual({ country: 'BR', region: 'S', uf: null, city: null });
  });
  it('setCity keeps the rest', () => {
    expect(setCity({ country: 392, region: 'ALL', uf: null, city: null }, '30627').city).toBe('30627');
  });
  it('maps every state to a region', () => {
    expect(Object.keys(REGION_OF)).toHaveLength(27);
    expect(REGION_OF.DF).toBe('CO');
  });
});

describe('split', () => {
  const square: Feature<Polygon> = {
    type: 'Feature', properties: {},
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
  };
  const bboxX = (f: Feature) => {
    const xs = (f.geometry as Polygon).coordinates[0].map((p) => p[0]);
    return [Math.min(...xs), Math.max(...xs)];
  };

  it('cuts west part red (L) and east part blue (R) at the share', () => {
    const parts = splitFeature(square, 0.6, { uf: 'BA' });
    expect(parts.map((p) => p.properties?.side)).toEqual(['L', 'R']);
    expect(bboxX(parts[0])).toEqual([0, 6]);
    expect(bboxX(parts[1])).toEqual([6, 10]);
    expect(parts[0].properties?.uf).toBe('BA');
  });
  it('returns a single grey feature when there is no share', () => {
    const parts = splitFeature(square, null, { uf: 'BA' });
    expect(parts).toHaveLength(1);
    expect(parts[0].properties?.side).toBe('X');
  });
  it('skips the empty side at 100%', () => {
    expect(splitFeature(square, 1, {}).map((p) => p.properties?.side)).toEqual(['L']);
  });
  it('share is null before release or with no votes', () => {
    expect(share(area(0, 0))).toBeNull();
    expect(share(area(5, 5, false))).toBeNull();
    expect(share(undefined)).toBeNull();
    expect(share(area(60, 40))).toBeCloseTo(0.6);
  });
  it('leaderSide', () => {
    expect(leaderSide(area(60, 40))).toBe('L');
    expect(leaderSide(area(40, 60))).toBe('R');
    expect(leaderSide(area(0, 0))).toBe('X');
  });
});

describe('format', () => {
  it('formats pt-BR percentages and integers', () => {
    expect(formatPct(0.5036)).toBe('50,36%');
    expect(formatPct(0.5, 0)).toBe('50%');
    expect(formatInt(158745502)).toBe('158.745.502');
  });
});
