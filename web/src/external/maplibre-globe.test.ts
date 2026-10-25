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

describe('MapLibreGlobe first round (solid fills)', () => {
  const japan: AreaCollection = { type: 'FeatureCollection', features: [square(138, 35, { iso: 392 })] };
  const munis: AreaCollection = { type: 'FeatureCollection', features: [square(-42, -13, { id: '2900207' })] };

  it('paints states whole with the winner color, grey without one', async () => {
    const { fake, globe } = await mounted();
    globe.setStates({ type: 'FeatureCollection', features: [...states.features, square(-50, -25, { uf: 'PR' })] },
      { ba: { fill: '#d7262d', el: 10 }, pr: { fill: null, el: 0 } });
    const fc = fake.data.br as AreaCollection;
    expect(fc.features.map((f) => [f.properties?.uf, f.properties?.side, f.properties?.color])).toEqual([['BA', 'W', '#d7262d'], ['PR', 'X', undefined]]);
  });

  it('does not split countries and municipalities', async () => {
    const { fake, globe } = await mounted();
    globe.setWorld(japan, { '392': { fill: '#1f5fe0', el: 5 } });
    globe.setMunicipalities('BA', munis, { '2900207': { fill: '#2e9e5b', el: 5 } });
    expect((fake.data.world as AreaCollection).features.map((f) => f.properties)).toEqual([{ iso: 392, side: 'W', color: '#1f5fe0' }]);
    expect((fake.data.muni as AreaCollection).features.map((f) => f.properties)).toEqual([{ id: '2900207', side: 'W', color: '#2e9e5b' }]);
  });

  it('colors abroad city dots by the winner and sizes them by electorate', async () => {
    const { fake, globe } = await mounted();
    globe.setAbroadCities([{ cd: '30627', nm: 'Tóquio', country: 'Japão', iso: 392, lat: 35, lon: 139 }], { '30627': { fill: '#1f5fe0', el: 40 } });
    const props = (fake.data.cities as AreaCollection).features[0].properties;
    expect(props).toEqual({ cd: '30627', iso: 392, el: 40, side: 'W', color: '#1f5fe0' });
  });

  it('fill expressions use the color of whole areas', async () => {
    const { fake } = await mounted();
    const layer = fake.calls.find((c) => c.name === 'addLayer' && (c.args[0] as { id: string }).id === 'br-fill')!;
    expect(JSON.stringify((layer.args[0] as { paint: unknown }).paint)).toContain('"W",["get","color"]');
  });

  it('second-round city dots keep the leader side', async () => {
    const { fake, globe } = await mounted();
    globe.setAbroadCities([{ cd: '30627', nm: 'Tóquio', country: 'Japão', iso: 392, lat: 35, lon: 139 }], { '30627': released });
    expect((fake.data.cities as AreaCollection).features[0].properties).toEqual({ cd: '30627', iso: 392, el: 1, side: 'L' });
  });

  it('with a bottom dock it flies to the centre of the area instead of fitting bounds', async () => {
    const { fake, globe } = await mounted();
    Object.defineProperty(fake.canvas, 'clientWidth', { value: 390 });
    Object.defineProperty(fake.canvas, 'clientHeight', { value: 844 });
    globe.setStates(states, { ba: released });
    globe.setPadding({ top: 100, right: 60, bottom: 320, left: 20 });
    globe.focus({ kind: 'uf', uf: 'BA' });
    const fly = fake.last('flyTo')!.args[0] as { center: number[]; zoom: number; padding: unknown };
    expect(fake.last('fitBounds')).toBeUndefined();
    expect(fly.center[0]).toBeCloseTo(-41.5);
    expect(fly.center[1]).toBeCloseTo(-12.5, 1);
    expect(fly.zoom).toBeCloseTo(Math.log2((310 * 360) / 512), 5); // width-bound: 310 px for 1°
    expect(fly.padding).toEqual({ top: 100, right: 60, bottom: 320, left: 20 });
  });

  it('with a bottom dock a large area gets the zoom that fits it', async () => {
    const { fake, globe } = await mounted();
    Object.defineProperty(fake.canvas, 'clientWidth', { value: 390 });
    Object.defineProperty(fake.canvas, 'clientHeight', { value: 844 });
    const big = { type: 'FeatureCollection' as const, features: [{ ...square(-74, -34, { uf: 'XX' }), geometry: { type: 'Polygon' as const, coordinates: [[[-74, -34], [-34, -34], [-34, 5], [-74, 5], [-74, -34]]] } }] };
    globe.setStates(big, {});
    globe.setPadding({ top: 100, right: 60, bottom: 320, left: 20 });
    globe.focus({ kind: 'brazil', region: 'ALL' });
    const fly = fake.last('flyTo')!.args[0] as { zoom: number };
    expect(fly.zoom).toBeCloseTo(Math.log2((310 * 360) / (512 * 40)), 5);
  });
});
