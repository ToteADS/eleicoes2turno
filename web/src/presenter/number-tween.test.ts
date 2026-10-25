import { formatInt, formatPct } from '../domain/format';
import { ManualClock } from '../testing/manual-clock';
import { NumberTween } from './number-tween';

const pct = (v: number) => formatPct(v);

describe('NumberTween', () => {
  let clock: ManualClock;
  let nt: NumberTween;
  let el: HTMLElement;
  beforeEach(() => {
    clock = new ManualClock();
    nt = new NumberTween(clock, 800);
    el = document.createElement('b');
  });

  it('the first value is written at once, even when asked to animate', () => {
    nt.set(el, 1234, formatInt, true);
    expect(el.textContent).toBe('1.234');
    expect(el.classList.contains('bump')).toBe(false);
    expect(clock.pending).toBe(0);
  });

  it('counts up with pt-BR formatting on every frame and lands on the exact value', () => {
    nt.set(el, 1000, formatInt, false);
    nt.set(el, 2000, formatInt, true);
    expect(el.textContent).toBe('1.000'); // still the old value until the first frame
    expect(el.classList.contains('bump')).toBe(true);
    const texts: string[] = [];
    for (let i = 0; i < 60 && clock.pending; i++) {
      clock.step(100);
      texts.push(el.textContent!);
    }
    expect(texts[texts.length - 1]).toBe('2.000');
    expect(texts.length).toBe(8); // 800 ms at 100 ms a frame
    for (const t of texts) expect(t).toMatch(/^\d\.\d{3}$/);
    const values = texts.map((t) => Number(t.replace('.', '')));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    expect(values[0] - 1000).toBeGreaterThan(values[7] - values[6]); // eases out: big steps first
  });

  it('counts down percentages too', () => {
    nt.set(el, 0.5612, pct, false);
    nt.set(el, 0.5234, pct, true);
    clock.step(400);
    const mid = parseFloat(el.textContent!.replace(',', '.'));
    expect(mid).toBeLessThan(56.12);
    expect(mid).toBeGreaterThan(52.34);
    expect(el.textContent).toMatch(/^\d{2},\d{2}%$/);
    clock.run(100);
    expect(el.textContent).toBe('52,34%');
  });

  it('no tween and no pulse when the shown text would not change', () => {
    nt.set(el, 0.5, pct, false);
    nt.set(el, 0.500001, pct, true);
    expect(clock.pending).toBe(0);
    expect(el.classList.contains('bump')).toBe(false);
    nt.set(el, 0.500001, pct, true);
    expect(clock.pending).toBe(0);
  });

  it('without animate the new value replaces a running tween at once and clears the pulse', () => {
    nt.set(el, 10, formatInt, false);
    nt.set(el, 20, formatInt, true);
    clock.step(100);
    nt.set(el, 30, formatInt, false);
    expect(el.textContent).toBe('30');
    expect(el.classList.contains('bump')).toBe(false);
    clock.run(100);
    expect(el.textContent).toBe('30');
  });

  it('a new value mid-tween continues from what is on screen', () => {
    nt.set(el, 0, formatInt, false);
    nt.set(el, 1000, formatInt, true);
    clock.step(400);
    const mid = Number(el.textContent!.replace('.', ''));
    nt.set(el, 0, formatInt, true);
    clock.step(1);
    expect(Number(el.textContent!.replace('.', ''))).toBeLessThanOrEqual(mid);
    expect(Number(el.textContent!.replace('.', ''))).toBeGreaterThan(0);
    clock.run(100);
    expect(el.textContent).toBe('0');
  });

  it('can count without the pulse', () => {
    nt.set(el, 1, formatInt, false);
    nt.set(el, 2, formatInt, true, false);
    expect(clock.pending).toBe(1);
    expect(el.classList.contains('bump')).toBe(false);
  });

  it('text() stops the tween and forgets the number', () => {
    nt.set(el, 1, formatInt, false);
    nt.set(el, 9, formatInt, true);
    nt.text(el, '–');
    clock.run(100);
    expect(el.textContent).toBe('–');
    nt.set(el, 5, formatInt, true); // first number again: no tween
    expect(el.textContent).toBe('5');
    expect(clock.pending).toBe(0);
  });

  it('finishAll lands every running tween on its final text', () => {
    const other = document.createElement('em');
    nt.set(el, 1, formatInt, false);
    nt.set(other, 0.1, pct, false);
    nt.set(el, 500, formatInt, true);
    nt.set(other, 0.2, pct, true);
    clock.step(100);
    nt.finishAll();
    expect(el.textContent).toBe('500');
    expect(other.textContent).toBe('20,00%');
    expect(clock.pending).toBe(0);
  });

  it('uses the browser clock by default', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const plain = new NumberTween();
    plain.set(el, 1, formatInt, false);
    plain.set(el, 2, formatInt, true);
    expect(raf).toHaveBeenCalled();
    raf.mockRestore();
  });
});
