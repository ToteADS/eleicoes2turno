import { lerp } from '../domain/tween';
import { browserClock, tween, type FrameClock, type Tween } from '../infra/animation';

export const NUMBER_TWEEN_MS = 800;
const BUMP = 'bump';

/**
 * Writes numbers into text nodes. With `animate` the text counts from the value shown
 * before to the new one (formatted on every frame) and the element pulses once;
 * without it, or on the first value an element gets, the text is set right away.
 */
export class NumberTween {
  private shown = new WeakMap<Element, number>();
  private running = new Map<Element, Tween>();
  private at = new WeakMap<Element, () => number>();

  constructor(private readonly clock: FrameClock = browserClock, private readonly duration = NUMBER_TWEEN_MS) {}

  set(el: HTMLElement, value: number, format: (v: number) => string, animate: boolean, pulse = true): void {
    const prev = this.current(el);
    this.stop(el);
    this.shown.set(el, value);
    const text = format(value);
    if (!animate || prev === undefined || prev === value || format(prev) === text) {
      if (!animate) el.classList.remove(BUMP);
      el.textContent = text;
      return;
    }
    el.textContent = format(prev);
    if (pulse) this.pulse(el);
    let at = prev;
    const tw = tween({
      duration: this.duration,
      clock: this.clock,
      frame: (e) => {
        at = lerp(prev, value, e);
        el.textContent = e >= 1 ? text : format(at);
        if (e >= 1) this.running.delete(el);
      },
    });
    this.running.set(el, tw);
    this.at.set(el, () => at);
  }

  /** Plain text that is not a number (a dash, a sentence): stops any tween on the element. */
  text(el: HTMLElement, text: string): void {
    this.stop(el);
    this.shown.delete(el);
    el.classList.remove(BUMP);
    el.textContent = text;
  }

  /** Stops every running tween, leaving each element on its final text. */
  finishAll(): void {
    for (const tw of [...this.running.values()]) tw.finish();
    this.running.clear();
  }

  /** the value on screen right now (mid-tween: the in-between value) */
  private current(el: Element): number | undefined {
    if (this.running.has(el)) return this.at.get(el)?.();
    return this.shown.get(el);
  }

  private stop(el: Element): void {
    this.running.get(el)?.cancel();
    this.running.delete(el);
  }

  private pulse(el: HTMLElement): void {
    el.classList.remove(BUMP);
    void el.offsetWidth; // restart the CSS animation
    el.classList.add(BUMP);
  }
}
