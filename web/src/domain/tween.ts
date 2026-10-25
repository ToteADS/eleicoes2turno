/** Pure tween math shared by the card numbers and the globe colours. */

/** Ease-out cubic: fast start, gentle landing (CSS: cubic-bezier(0.33, 1, 0.68, 1)). */
export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

export const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const lerp = (a: number, b: number, t: number): number => (t >= 1 ? b : a + (b - a) * t);

/** How far (0..1) a tween that started at `start` and lasts `duration` ms is at `now`. */
export const progress = (start: number, now: number, duration: number): number =>
  duration <= 0 ? 1 : clamp01((now - start) / duration);
