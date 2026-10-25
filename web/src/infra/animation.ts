import { easeOutCubic, progress } from '../domain/tween';

/** The browser's frame loop, behind an interface so tests can drive it by hand. */
export interface FrameClock {
  now(): number;
  request(cb: () => void): number;
  cancel(id: number): void;
}

export const browserClock: FrameClock = {
  now: () => performance.now(),
  request: (cb) => window.requestAnimationFrame(() => cb()),
  cancel: (id) => window.cancelAnimationFrame(id),
};

export interface TweenOptions {
  duration: number;
  /** called with the eased progress (0..1]; the last call is always exactly 1 */
  frame(eased: number): void;
  clock?: FrameClock;
  /** min ms between two frames (throttles heavy frames); read again on every tick */
  minInterval?: () => number;
  ease?: (t: number) => number;
}

export interface Tween {
  /** stops where it is (no final frame) */
  cancel(): void;
  /** jumps to the end now (runs the final frame) */
  finish(): void;
  readonly done: boolean;
}

/** Runs `frame` on animation frames for `duration` ms, then once more at the end. */
export function tween(o: TweenOptions): Tween {
  const clock = o.clock ?? browserClock;
  const ease = o.ease ?? easeOutCubic;
  const start = clock.now();
  let last = -Infinity;
  let id = 0;
  let done = false;
  const stop = () => { done = true; clock.cancel(id); };
  const tick = () => {
    if (done) return;
    const now = clock.now();
    const p = progress(start, now, o.duration);
    if (p >= 1) {
      stop();
      o.frame(1);
      return;
    }
    if (now - last >= (o.minInterval?.() ?? 0)) {
      last = now;
      o.frame(ease(p));
    }
    if (!done) id = clock.request(tick);
  };
  id = clock.request(tick);
  return {
    cancel: stop,
    finish: () => { if (done) return; stop(); o.frame(1); },
    get done() { return done; },
  };
}

/** The visitor asked the system for less motion: no tweens, no pulses. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
