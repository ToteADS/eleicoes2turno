import { sectionsLabel } from './format';
import { labelPoint, poleOfInaccessibility } from './label-point';
import { defaultMapOptions, ROUND1_MAP_OPTIONS } from './map-options';

describe('map options', () => {
  it('default to the percentage map without labels', () => {
    expect(defaultMapOptions()).toEqual({ type: 'share', sectionLabels: false });
    expect(defaultMapOptions()).not.toBe(defaultMapOptions());
  });

  it('the first round always uses the defaults (frozen)', () => {
    expect(ROUND1_MAP_OPTIONS).toEqual(defaultMapOptions());
    expect(Object.isFrozen(ROUND1_MAP_OPTIONS)).toBe(true);
  });
});

describe('sectionsLabel', () => {
  const r = (st: number, ts: number) => ({ st, ts });

  it('formats the share of sections totalized per locale, one decimal at most', () => {
    expect(sectionsLabel(r(3, 8))).toBe('37,5%');
    expect(sectionsLabel(r(3, 8), 'pt')).toBe('37,5%');
    expect(sectionsLabel(r(3, 8), 'en')).toBe('37.5%');
    expect(sectionsLabel(r(3, 8), 'es')).toMatch(/^37,5\s?%$/);
    expect(sectionsLabel(r(1, 4))).toBe('25%');
    expect(sectionsLabel(r(1, 1))).toBe('100%');
    expect(sectionsLabel(r(1, 3), 'pt-BR')).toBe('33,3%');
  });

  it('rounds down, so only a complete count reads 100%', () => {
    expect(sectionsLabel(r(9999, 10000))).toBe('99,9%');
    expect(sectionsLabel(r(2, 3))).toBe('66,6%');
    expect(sectionsLabel(r(1, 100000))).toBe('<0,1%');
    expect(sectionsLabel(r(1, 100000), 'en')).toBe('<0.1%');
  });

  it('no label without results, sections or anything counted', () => {
    expect(sectionsLabel(undefined)).toBeNull();
    expect(sectionsLabel(r(0, 0))).toBeNull();
    expect(sectionsLabel(r(0, 10))).toBeNull();
  });

  it('caps a count above the total at 100%', () => {
    expect(sectionsLabel(r(12, 10))).toBe('100%');
  });
});

describe('labelPoint', () => {
  const poly = (ring: number[][]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [ring] } });
  const inside = (p: number[], ring: number[][]) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };

  it('a square gets its centre', () => {
    const [x, y] = labelPoint(poly([[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]));
    expect(x).toBeCloseTo(2, 0);
    expect(y).toBeCloseTo(2, 0);
  });

  it('an L shape gets a point inside it, unlike its centroid', () => {
    const ring = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10], [0, 0]];
    const p = labelPoint(poly(ring));
    expect(inside(p, ring)).toBe(true);
  });

  it('a multipolygon is labelled on its largest part', () => {
    const small = [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]];
    const big = [[[0, 0], [6, 0], [6, 6], [0, 6], [0, 0]]];
    const [x] = labelPoint({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [small, big] } });
    expect(x).toBeLessThan(6);
  });

  it('holes push the point away from them', () => {
    const outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const hole = [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]];
    const [x, y] = poleOfInaccessibility([outer, hole]);
    expect(x > 3 && x < 7 && y > 3 && y < 7).toBe(false);
  });

  it('C and arrow shapes get a point inside them', () => {
    const c = [[0, 0], [10, 0], [10, 1], [1, 1], [1, 9], [10, 9], [10, 10], [0, 10], [0, 0]];
    const arrow = [[0, 0], [10, 5], [0, 10], [3, 5], [0, 0]];
    for (const ring of [c, arrow]) expect(inside(poleOfInaccessibility([ring]), ring)).toBe(true);
  });

  it('empty parts of a multipolygon are skipped', () => {
    const big = [[[0, 0], [6, 0], [6, 6], [0, 6], [0, 0]]];
    const [x, y] = labelPoint({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[], big, [[[20, 20], [21, 20], [21, 21], [20, 20]]]] } });
    expect([x, y].map(Math.round)).toEqual([3, 3]);
  });

  it('degenerate shapes still give a point', () => {
    expect(poleOfInaccessibility([[[1, 1], [1, 1]]])).toEqual([1, 1]);
    expect(poleOfInaccessibility([[]])).toEqual([0, 0]);
    expect(poleOfInaccessibility([])).toEqual([0, 0]);
    expect(poleOfInaccessibility([[[0, 0], [4, 0], [2, 0], [0, 0]]])).toEqual([2, 0]); // flat
    const [x, y] = poleOfInaccessibility([[[0, 0], [2, 2], [4, 4], [0, 0]]]); // no area
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });
});
