import type { PresenceDto } from '../domain/dtos/presence-dto';
import type { PresenceAnswer } from '../domain/types';
import { setLocale } from '../i18n';
import { OnlineCounter } from './online-counter';

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/** Fake API answering a queue of results (a number, or an error to throw). */
function fakeApi(answers: (number | Error | PresenceAnswer)[]) {
  const sent: unknown[] = [];
  return {
    sent,
    presence(dto: PresenceDto): Promise<PresenceAnswer> {
      sent.push(dto.toJson());
      const a = answers.length > 1 ? answers.shift()! : answers[0];
      if (a instanceof Error) return Promise.reject(a);
      return Promise.resolve(typeof a === 'number' ? { online: a } : a);
    },
  };
}

let hidden = false;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
const setHidden = (h: boolean) => {
  hidden = h;
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('OnlineCounter', () => {
  let host: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    setLocale('pt');
    hidden = false;
    host = document.createElement('div');
  });
  afterEach(() => vi.useRealTimers());

  const pill = () => host.querySelector<HTMLElement>('.online')!;

  it('stays hidden until the first answer, then shows the formatted count', async () => {
    const api = fakeApi([1234]);
    const counter = new OnlineCounter(host, api, ID);
    expect(pill().hidden).toBe(true);
    counter.start();
    expect(api.sent).toEqual([{ id: ID }]);
    expect(pill().hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(pill().hidden).toBe(false);
    expect(pill().textContent).toBe('1.234 pessoas online agora');
    expect(pill().querySelector('.online-dot')?.getAttribute('aria-hidden')).toBe('true');
    counter.stop();
  });

  it('uses the singular for one person and translates', async () => {
    const counter = new OnlineCounter(host, fakeApi([1]), ID);
    counter.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(pill().textContent).toBe('1 pessoa online agora');
    counter.stop();
    setLocale('en');
    const other = document.createElement('div');
    const en = new OnlineCounter(other, fakeApi([2]), ID);
    en.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(other.textContent).toBe('2 people online now');
    en.stop();
    setLocale('pt');
  });

  it('beats every minute and updates the count', async () => {
    const api = fakeApi([3, 5]);
    const counter = new OnlineCounter(host, api, ID);
    counter.start();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(api.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.sent).toHaveLength(2);
    expect(pill().textContent).toBe('5 pessoas online agora');
    counter.stop();
  });

  it('pauses while the tab is hidden and beats right away when it comes back', async () => {
    const api = fakeApi([4]);
    const counter = new OnlineCounter(host, api, ID);
    counter.start();
    await vi.advanceTimersByTimeAsync(0);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(api.sent).toHaveLength(1);
    setHidden(false);
    expect(api.sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.sent).toHaveLength(3);
    counter.stop();
  });

  it('does not beat when started in a background tab', async () => {
    hidden = true;
    const api = fakeApi([4]);
    const counter = new OnlineCounter(host, api, ID);
    counter.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.sent).toHaveLength(0);
    setHidden(false);
    expect(api.sent).toHaveLength(1);
    counter.stop();
  });

  it('keeps the last count through one failure and hides after repeated failures', async () => {
    const api = fakeApi([7, new Error('503'), 8, new Error('503'), new Error('503')]);
    const counter = new OnlineCounter(host, api, ID);
    counter.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(pill().hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000); // one failure
    expect(pill().hidden).toBe(false);
    expect(pill().textContent).toBe('7 pessoas online agora');
    await vi.advanceTimersByTimeAsync(60_000); // recovers
    expect(pill().textContent).toBe('8 pessoas online agora');
    await vi.advanceTimersByTimeAsync(120_000); // two in a row
    expect(pill().hidden).toBe(true);
    counter.stop();
  });

  it('treats a malformed answer as a failure', async () => {
    const counter = new OnlineCounter(host, fakeApi([{ online: Number.NaN }]), ID, { maxFailures: 1 });
    counter.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(pill().hidden).toBe(true);
    counter.stop();
  });

  it('stops beating and ignores late answers once stopped', async () => {
    const api = fakeApi([9]);
    const counter = new OnlineCounter(host, api, ID);
    counter.start();
    counter.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(pill().hidden).toBe(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.sent).toHaveLength(1);
  });
});
