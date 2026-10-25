import { ManualClock } from '../testing/manual-clock';
import { browserClock, prefersReducedMotion, tween } from './animation';

describe('tween', () => {
  it('runs eased frames and ends exactly on 1', () => {
    const clock = new ManualClock();
    const seen: number[] = [];
    const tw = tween({ duration: 100, clock, frame: (e) => seen.push(e) });
    expect(seen).toEqual([]); // nothing before the first animation frame
    clock.run(25);
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen.length).toBe(4); // 25, 50, 75, then the end at 100
    expect(seen[0]).toBeCloseTo(1 - 0.75 ** 3);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    expect(tw.done).toBe(true);
    expect(clock.pending).toBe(0);
  });

  it('throttles to minInterval but never skips the last frame', () => {
    const clock = new ManualClock();
    const seen: number[] = [];
    tween({ duration: 100, clock, minInterval: () => 40, frame: (e) => seen.push(e), ease: (t) => t });
    clock.run(10);
    expect(seen).toEqual([0.1, 0.5, 0.9, 1]);
  });

  it('cancel stops where it is; finish jumps to the end once', () => {
    const clock = new ManualClock();
    const a: number[] = [];
    const ta = tween({ duration: 100, clock, frame: (e) => a.push(e), ease: (t) => t });
    clock.step(50);
    ta.cancel();
    clock.run();
    expect(a).toEqual([0.5]);

    const b: number[] = [];
    const tb = tween({ duration: 100, clock, frame: (e) => b.push(e), ease: (t) => t });
    tb.finish();
    tb.finish();
    clock.run();
    expect(b).toEqual([1]);
    expect(tb.done).toBe(true);
  });

  it('a frame that still fires after cancel does nothing', () => {
    let cb: () => void = () => {};
    const clock = { now: () => 50, request: (f: () => void) => { cb = f; return 1; }, cancel: () => undefined };
    const seen: number[] = [];
    tween({ duration: 100, clock, frame: (e) => seen.push(e) }).cancel();
    cb();
    expect(seen).toEqual([]);
  });

  it('defaults to the browser clock', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 3);
    tween({ duration: 100, frame: () => undefined });
    expect(raf).toHaveBeenCalled();
    raf.mockRestore();
  });

  it('the browser clock uses requestAnimationFrame', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 7; });
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    let ran = false;
    expect(browserClock.request(() => { ran = true; })).toBe(7);
    browserClock.cancel(7);
    expect(ran).toBe(true);
    expect(caf).toHaveBeenCalledWith(7);
    expect(typeof browserClock.now()).toBe('number');
    raf.mockRestore();
    caf.mockRestore();
  });
});

describe('prefersReducedMotion', () => {
  afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });

  it('false when the browser cannot tell', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('follows the media query', () => {
    const queries: string[] = [];
    window.matchMedia = ((q: string) => { queries.push(q); return { matches: true } as MediaQueryList; }) as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
    expect(queries).toEqual(['(prefers-reduced-motion: reduce)']);
  });
});
