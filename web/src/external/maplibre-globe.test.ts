import type { AreaCollection } from '../infra/globe';
import type { AreaResult } from '../domain/types';
import { MapLibreGlobe, type MapLike } from './maplibre-globe';

class FakeMap {
  calls: { name: string; args: unknown[] }[] = [];
  handlers: Record<string, ((e?: unknown) => void)[]> = {};
  data: Record<string, unknown> = {};
  canvas = document.createElement('canvas');
  center = { lng: 0, lat: 0 };

  record = (name: string) => (...args: unknown[]) => { this.calls.push({ name, args }); };
  on = (event: string, a: unknown, b?: unknown) => {
    const cb = (typeof a === 'function' ? a : b) as (e?: unknown) => void;
    (this.handlers[event] ??= []).push(cb);
  };
  once = (event: string, cb: () => void) => this.on(event, cb);
  fire = (event: string, e?: unknown) => (this.handlers[event] ?? []).forEach((cb) => cb(e));
  addSource = (id: string, src: { data: unknown }) => { this.data[id] = src.data; };
  getSource = (id: string) => ({ setData: (d: unknown) => { this.data[id] = d; } });
  addLayer = this.record('addLayer');
  setPaintProperty = this.record('setPaintProperty');
  setLayoutProperty = this.record('setLayoutProperty');
  setFilter = this.record('setFilter');
  fitBounds = this.record('fitBounds');
  flyTo = this.record('flyTo');
  easeTo = this.record('easeTo');
  stop = this.record('stop');
  zoomIn = this.record('zoomIn');
  zoomOut = this.record('zoomOut');
  getCenter = () => this.center;
  getCanvas = () => this.canvas;
  queryRenderedFeatures = () => [] as unknown[];
  last(name: string) {
    return [...this.calls].reverse().find((c) => c.name === name);
  }
}

const square = (x: number, y: number, props: Record<string, unknown>) => ({
  type: 'Feature' as const,
  properties: props,
  geometry: { type: 'Polygon' as const, coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] },
});
const states: AreaCollection = { type: 'FeatureCollection', features: [square(-42, -13, { uf: 'BA', name: 'Bahia' })] };
const released: AreaResult = { el: 1, comp: 1, abst: 0, vv: 1, vb: 0, vn: 0, l: 6, f: 4, st: 1, ts: 1, dg: '', hg: '', released: true };

async function mounted() {
  const fake = new FakeMap();
  const globe = new MapLibreGlobe(() => fake as unknown as MapLike);
  const p = globe.mount(document.createElement('div'));
  fake.fire('load');
  await p;
  return { fake, globe };
}

describe('MapLibreGlobe', () => {
  it('mounts and adds the layers once the map loads', async () => {
    const { fake } = await mounted();
    expect(fake.calls.filter((c) => c.name === 'addLayer').length).toBeGreaterThan(5);
  });

  it('splits states by share into red and blue parts', async () => {
    const { fake, globe } = await mounted();
    globe.setStates(states, { ba: released });
    const fc = fake.data.br as AreaCollection;
    expect(fc.features.map((f) => f.properties?.side)).toEqual(['L', 'R']);
  });

  it('focus on a state flies with the current padding and stops rotation', async () => {
    const { fake, globe } = await mounted();
    globe.setStates(states, { ba: released });
    globe.setPadding({ top: 100, right: 420, bottom: 40, left: 40 });
    globe.rotation.start();
    globe.focus({ kind: 'uf', uf: 'BA' });
    const fit = fake.last('fitBounds');
    expect(fit).toBeDefined();
    expect((fit!.args[1] as { padding: unknown }).padding).toEqual({ top: 100, right: 420, bottom: 40, left: 40 });
    expect(globe.rotation.running).toBe(false);
  });

  it('focus all flies to Brazil and starts spinning when the flight ends', async () => {
    const { fake, globe } = await mounted();
    globe.focus({ kind: 'all' });
    expect((fake.last('flyTo')!.args[0] as { center: number[] }).center).toEqual([-52, -14]);
    expect(globe.rotation.running).toBe(false);
    fake.fire('moveend');
    expect(globe.rotation.running).toBe(true);
  });

  it('user interaction stops rotation and is reported', async () => {
    const { fake, globe } = await mounted();
    let interacted = 0;
    globe.onUserInteract(() => interacted++);
    globe.rotation.start();
    fake.canvas.dispatchEvent(new Event('pointerdown'));
    expect(globe.rotation.running).toBe(false);
    expect(interacted).toBe(1);
  });

  it('reports picks from rendered features', async () => {
    const { fake, globe } = await mounted();
    const picks: unknown[] = [];
    globe.onPick((p) => picks.push(p));
    fake.queryRenderedFeatures = () => [{ layer: { id: 'br-fill' }, properties: { uf: 'BA' } }];
    fake.fire('click', { point: { x: 1, y: 2 } });
    expect(picks).toEqual([{ kind: 'uf', uf: 'BA' }]);
  });
});
