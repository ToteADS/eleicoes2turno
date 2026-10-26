import type { AreaResult } from '../domain/types';
import { BLUE, colorProps, GHOST, leadProps, lookOf, mixLook, RED, sameLook, TIE } from './area-look';

const r = (l: number, f: number, released = true): AreaResult => ({ el: 1, comp: 1, abst: 0, vv: l + f, vb: 0, vn: 0, l, f, st: 1, ts: 1, dg: '', hg: '', released });

describe('area looks', () => {
  it('a result is a red × blue split at Lula\'s share, led by the bigger side', () => {
    expect(lookOf(r(6, 4))).toEqual({ share: 0.6, west: RED, east: BLUE, lead: RED });
    expect(lookOf(r(1, 3)).lead).toBe(BLUE);
    expect(lookOf(r(2, 2)).lead).toBe(GHOST); // a tie has no leader
  });

  it('no numbers is whole and grey', () => {
    for (const x of [undefined, r(0, 0), r(5, 5, false)]) expect(lookOf(x)).toEqual({ share: null, west: GHOST, east: GHOST, lead: GHOST });
  });

  it('mixLook ends exactly on both looks', () => {
    const a = lookOf(r(6, 4));
    const b = lookOf(r(3, 7));
    expect(mixLook(a, b, 0)).toEqual(a);
    expect(mixLook(a, b, 1)).toBe(b);
  });

  it('the line slides between shares and the leader colour blends', () => {
    const m = mixLook(lookOf(r(6, 4)), lookOf(r(4, 6)), 0.5);
    expect(m.share).toBeCloseTo(0.5);
    expect([m.west, m.east]).toEqual([RED, BLUE]);
    expect(m.lead).not.toBe(RED);
    expect(m.lead).not.toBe(BLUE);
  });

  it('first numbers fade in from grey on the new line; lost numbers fade out on the old one', () => {
    const grey = lookOf(undefined);
    const inn = mixLook(grey, lookOf(r(7, 3)), 0.5);
    expect(inn.share).toBeCloseTo(0.7);
    expect(inn.west).not.toBe(GHOST);
    expect(inn.west).not.toBe(RED);
    const out = mixLook(lookOf(r(7, 3)), grey, 0.5);
    expect(out.share).toBeCloseTo(0.7);
    expect(mixLook(grey, grey, 0.5).share).toBeNull();
  });

  it('sameLook compares every field', () => {
    expect(sameLook(lookOf(r(6, 4)), lookOf(r(6, 4)))).toBe(true);
    expect(sameLook(lookOf(r(6, 4)), lookOf(r(7, 4)))).toBe(false);
    expect(sameLook(lookOf(r(6, 4)), { ...lookOf(r(6, 4)), west: '#000000' })).toBe(false);
    expect(sameLook(lookOf(r(6, 4)), { ...lookOf(r(6, 4)), east: '#000000' })).toBe(false);
    expect(sameLook(lookOf(r(6, 4)), { ...lookOf(r(6, 4)), lead: '#000000' })).toBe(false);
  });

  it('at rest pieces keep the shared sides; mid-tween they carry their colour', () => {
    expect(colorProps(RED, 'L')).toEqual({ side: 'L' });
    expect(colorProps(BLUE, 'R')).toEqual({ side: 'R' });
    expect(colorProps('#abcdef', 'L')).toEqual({ side: 'W', color: '#abcdef' });
    expect(leadProps(lookOf(r(6, 4)))).toEqual({ side: 'L' });
    expect(leadProps(lookOf(r(4, 6)))).toEqual({ side: 'R' });
    expect(leadProps(lookOf(undefined))).toEqual({ side: 'X' });
    expect(leadProps({ ...lookOf(r(6, 4)), lead: '#123456' })).toEqual({ side: 'W', color: '#123456' });
  });
});

describe('area looks, "Mais votos" map', () => {
  it('the whole area takes the leader colour: Lula red, Flávio blue', () => {
    expect(lookOf(r(6, 4), 'leader')).toEqual({ share: null, west: RED, east: RED, lead: RED });
    expect(lookOf(r(1, 3), 'leader')).toEqual({ share: null, west: BLUE, east: BLUE, lead: BLUE });
  });

  it('a tie is neutral and differs from no data', () => {
    expect(lookOf(r(2, 2), 'leader')).toEqual({ share: null, west: TIE, east: TIE, lead: TIE });
    expect(TIE).not.toBe(GHOST);
    expect(leadProps(lookOf(r(2, 2), 'leader'))).toEqual({ side: 'W', color: TIE });
  });

  it('no numbers stay grey', () => {
    for (const x of [undefined, r(0, 0), r(5, 5, false)]) expect(lookOf(x, 'leader')).toEqual(lookOf(x));
  });

  it('the share map stays the default', () => {
    expect(lookOf(r(6, 4), 'share')).toEqual(lookOf(r(6, 4)));
  });

  it('a leader change blends the colour in OKLab without a split line', () => {
    const m = mixLook(lookOf(r(6, 4), 'leader'), lookOf(r(4, 6), 'leader'), 0.5);
    expect(m.share).toBeNull();
    expect([RED, BLUE]).not.toContain(m.lead);
    expect(leadProps(m)).toEqual({ side: 'W', color: m.lead });
    expect(leadProps(lookOf(r(6, 4), 'leader'))).toEqual({ side: 'L' });
  });
});
