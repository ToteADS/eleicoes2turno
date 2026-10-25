import { clamp01, easeOutCubic, lerp, progress } from './tween';

describe('tween math', () => {
  it('ease-out cubic starts at 0, lands on 1 and moves fast first', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });

  it('clamps out-of-range input', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect([clamp01(-0.1), clamp01(0.4), clamp01(7)]).toEqual([0, 0.4, 1]);
  });

  it('lerp hits both ends exactly', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(0.1, 0.3, 1)).toBe(0.3); // no float drift on the last frame
  });

  it('progress follows the clock and copes with a zero duration', () => {
    expect(progress(100, 100, 800)).toBe(0);
    expect(progress(100, 500, 800)).toBe(0.5);
    expect(progress(100, 2000, 800)).toBe(1);
    expect(progress(100, 100, 0)).toBe(1);
  });
});
