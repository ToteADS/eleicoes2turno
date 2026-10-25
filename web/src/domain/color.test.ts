import { fromOklab, mixColor, toOklab } from './color';

const RED = '#d7262d';
const BLUE = '#1f5fe0';
const GHOST = '#e3e6eb';

describe('mixColor (OKLab)', () => {
  it('returns the endpoints exactly', () => {
    expect(mixColor(RED, BLUE, 0)).toBe(RED);
    expect(mixColor(RED, BLUE, 1)).toBe(BLUE);
    expect(mixColor(RED, BLUE, -1)).toBe(RED);
    expect(mixColor(RED, BLUE, 3)).toBe(BLUE);
    expect(mixColor(GHOST, GHOST, 0.5)).toBe(GHOST);
  });

  it('round-trips through OKLab', () => {
    for (const c of [RED, BLUE, GHOST, '#000000', '#ffffff']) expect(fromOklab(toOklab(c))).toBe(c);
  });

  it('white is L=1 with no chroma', () => {
    const [L, a, b] = toOklab('#ffffff');
    expect(L).toBeCloseTo(1, 4);
    expect(a).toBeCloseTo(0, 4);
    expect(b).toBeCloseTo(0, 4);
  });

  it('the red × blue middle is a purple brighter than a plain sRGB average', () => {
    const mid = mixColor(RED, BLUE, 0.5);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(mid.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g);
    expect(b).toBeGreaterThan(g);
    expect(toOklab(mid)[0]).toBeGreaterThan(toOklab('#7b4387')[0]); // sRGB average of the two
  });

  it('grey → red moves steadily', () => {
    const L = [0, 0.25, 0.5, 0.75, 1].map((t) => toOklab(mixColor(GHOST, RED, t))[0]);
    for (let i = 1; i < L.length; i++) expect(L[i]).toBeLessThan(L[i - 1]);
  });

  it('accepts colours without the hash', () => {
    expect(mixColor('d7262d', '1f5fe0', 1)).toBe('1f5fe0');
    expect(mixColor('ffffff', '000000', 0.5)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
