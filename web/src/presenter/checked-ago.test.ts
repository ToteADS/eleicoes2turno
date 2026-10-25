import { setLocale } from '../i18n';
import { CheckedAgo, checkedAgoText } from './checked-ago';

describe('checkedAgoText', () => {
  beforeEach(() => setLocale('pt'));

  it('counts seconds under a minute and minutes after', () => {
    expect(checkedAgoText(0)).toBe('verificado há 0 s');
    expect(checkedAgoText(12_900)).toBe('verificado há 12 s');
    expect(checkedAgoText(59_999)).toBe('verificado há 59 s');
    expect(checkedAgoText(60_000)).toBe('verificado há 1 min');
    expect(checkedAgoText(150_000)).toBe('verificado há 2 min');
  });

  it('never shows a negative age (clock moved back)', () => {
    expect(checkedAgoText(-5_000)).toBe('verificado há 0 s');
  });

  it('translates', () => {
    setLocale('en');
    expect(checkedAgoText(12_000)).toBe('checked 12 s ago');
    expect(checkedAgoText(120_000)).toBe('checked 2 min ago');
    setLocale('es');
    expect(checkedAgoText(12_000)).toBe('verificado hace 12 s');
    setLocale('pt');
  });
});

describe('CheckedAgo', () => {
  let el: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T20:30:00Z'));
    setLocale('pt');
    el = document.createElement('span');
  });
  afterEach(() => vi.useRealTimers());

  it('stays empty until the first successful check', () => {
    const label = new CheckedAgo(el);
    label.start();
    vi.advanceTimersByTime(5_000);
    expect(el.textContent).toBe('');
    label.stop();
  });

  it('shows the age right away and ticks every second', () => {
    const label = new CheckedAgo(el);
    label.start();
    label.mark();
    expect(el.textContent).toBe('verificado há 0 s');
    vi.advanceTimersByTime(12_000);
    expect(el.textContent).toBe('verificado há 12 s');
    vi.advanceTimersByTime(60_000);
    expect(el.textContent).toBe('verificado há 1 min');
    label.mark();
    expect(el.textContent).toBe('verificado há 0 s');
    label.stop();
  });

  it('accepts an explicit check time and a custom tick', () => {
    const label = new CheckedAgo(el, { tickMs: 5_000 });
    label.mark(Date.now() - 30_000);
    expect(el.textContent).toBe('verificado há 30 s');
    label.start();
    vi.advanceTimersByTime(4_999);
    expect(el.textContent).toBe('verificado há 30 s');
    vi.advanceTimersByTime(1);
    expect(el.textContent).toBe('verificado há 35 s');
    label.stop();
  });

  it('only touches the DOM when the text changes', () => {
    const label = new CheckedAgo(el, { tickMs: 100 });
    label.start();
    label.mark();
    const node = el.firstChild;
    vi.advanceTimersByTime(900);
    expect(el.firstChild).toBe(node);
    label.stop();
  });

  it('stops ticking', () => {
    const label = new CheckedAgo(el);
    label.start();
    label.start(); // idempotent
    label.mark();
    label.stop();
    vi.advanceTimersByTime(10_000);
    expect(el.textContent).toBe('verificado há 0 s');
  });
});
