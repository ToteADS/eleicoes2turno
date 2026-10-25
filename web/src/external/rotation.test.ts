import { IdleRotation, type RotatableMap } from './rotation';

function fakeMap() {
  const handlers: Record<string, () => void> = {};
  const map: RotatableMap & { eases: number; stops: number; fire: (e: string) => void } = {
    eases: 0,
    stops: 0,
    getCenter: () => ({ lng: 10, lat: 5 }),
    easeTo() { this.eases++; },
    stop() { this.stops++; },
    on(event: string, cb: () => void) { handlers[event] = cb; },
    fire(e: string) { handlers[e]?.(); },
  };
  return map;
}

describe('IdleRotation', () => {
  it('start eases west and keeps going on moveend', () => {
    const map = fakeMap();
    const r = new IdleRotation(map, () => ({ top: 0, right: 0, bottom: 0, left: 0 }));
    r.start();
    expect(r.running).toBe(true);
    expect(map.eases).toBe(1);
    map.fire('moveend');
    expect(map.eases).toBe(2);
  });

  it('stop halts and ignores later moveend', () => {
    const map = fakeMap();
    const r = new IdleRotation(map, () => ({ top: 0, right: 0, bottom: 0, left: 0 }));
    r.start();
    r.stop();
    expect(r.running).toBe(false);
    expect(map.stops).toBe(1);
    map.fire('moveend');
    expect(map.eases).toBe(1);
  });

  it('toggle flips and notifies', () => {
    const map = fakeMap();
    const r = new IdleRotation(map, () => ({ top: 0, right: 0, bottom: 0, left: 0 }));
    const seen: boolean[] = [];
    r.onChange((v) => seen.push(v));
    expect(r.toggle()).toBe(true);
    expect(r.toggle()).toBe(false);
    r.stop(); // already stopped: no extra notification
    expect(seen).toEqual([true, false]);
  });
});
