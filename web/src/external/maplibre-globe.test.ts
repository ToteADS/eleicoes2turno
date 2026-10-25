import type { AreaCollection } from '../infra/globe';
import type { AreaResult } from '../domain/types';
import { ManualClock } from '../testing/manual-clock';
import { frameInterval, MAX_TWEEN_AREAS, MapLibreGlobe, type MapLike } from './maplibre-globe';

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

async function mounted(clock?: ManualClock) {
  const fake = new FakeMap();
  const globe = new MapLibreGlobe(() => fake as unknown as MapLike, clock);
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

describe('MapLibreGlobe live update tween', () => {
  const at = (l: number, f: number): AreaResult => ({ ...released, l, f });
  const japan: AreaCollection = { type: 'FeatureCollection', features: [square(138, 35, { iso: 392 }), { ...square(150, 35, { iso: 392 }), geometry: { type: 'MultiPolygon' as const, coordinates: [square(140, 40, {}).geometry.coordinates, square(160, 20, {}).geometry.coordinates] } }] };
  const munis: AreaCollection = { type: 'FeatureCollection', features: [square(-42, -13, { id: '1' }), square(-41, -13, { id: '2' })] };
  const tokyo = [{ cd: '30627', nm: 'Tóquio', country: 'Japão', iso: 392, lat: 35, lon: 139 }];
  const brProps = (fake: FakeMap) => (fake.data.br as AreaCollection).features.map((f) => f.properties);
  const westEdge = (fake: FakeMap) => {
    const west = (fake.data.br as AreaCollection).features[0].geometry as { coordinates: number[][][] };
    return Math.max(...west.coordinates[0].map((p) => p[0]));
  };

  it('without animate the new split is drawn at once', async () => {
    const clock = new ManualClock();
    const { fake, globe } = await mounted(clock);
    globe.setStates(states, { ba: at(6, 4) });
    globe.setStates(states, { ba: at(3, 7) });
    expect(clock.pending).toBe(0);
    expect(westEdge(fake)).toBeCloseTo(-41.7);
  });

  it('the first paint never animates (nothing on screen to tween from)', async () => {
    const clock = new ManualClock();
    const { fake, globe } = await mounted(clock);
    globe.setStates(states, { ba: at(6, 4) }, { animate: true });
    expect(clock.pending).toBe(0);
    expect(brProps(fake)).toEqual([{ uf: 'BA', side: 'L' }, { uf: 'BA', side: 'R' }]);
  });

  it('slides the split line from the old share to the new one and ends on the resting sides', async () => {
    const clock = new ManualClock();
    const { fake, globe } = await mounted(clock);
    globe.setStates(states, { ba: at(6, 4) });
    globe.setStates(states, { ba: at(3, 7) }, { animate: true });
    expect(westEdge(fake)).toBeCloseTo(-41.4); // old frame until the first animation frame
    clock.step(100);
    const mid = westEdge(fake);
    expect(mid).toBeLessThan(-41.4);
    expect(mid).toBeGreaterThan(-41.7);
    clock.run(50);
    expect(westEdge(fake)).toBeCloseTo(-41.7);
    expect(brProps(fake)).toEqual([{ uf: 'BA', side: 'L' }, { uf: 'BA', side: 'R' }]);
    expect(globe.frameCosts.length).toBeGreaterThan(1);
  });

  it('an area getting its first numbers fades in from grey', async () => {
    const clock = new ManualClock();
    const { fake, globe } = await mounted(clock);
    globe.setStates(states, {});
    expect(brProps(fake)).toEqual([{ uf: 'BA', side: 'X' }]);
    globe.setStates(states, { ba: at(6, 4) }, { animate: true });
    clock.step(100);
    const mid = brProps(fake);
    expect(mid.map((p) => p?.side)).toEqual(['W', 'W']);
    expect(mid[0]?.color).not.toBe('#d7262d');
    clock.run(50);
    expect(brProps(fake)).toEqual([{ uf: 'BA', side: 'L' }, { uf: 'BA', side: 'R' }]);
  });

  it('only areas that changed are tweened; unchanged ones keep their pieces', async () => {
    const clock = new ManualClock();
    const { fake, globe } = await mounted(clock);
    globe.setMunicipalities('BA', munis, { 1: at(6, 4), 2: at(5, 5) });
    const before = (fake.data.muni as AreaCollection).features.slice(2);
    globe.setMunicipalities('BA', munis, { 1: at(4, 6), 2: at(5, 5) }, { animate: true });
    clock.step(100);
    expect((fake.data.muni as AreaCollection).features.slice(2)).toEqual(before);
    clock.run(50);
  });

  it('the same numbers again draw at once', async () => {
    const clock = new ManualClock();
    const { globe } = await mounted(clock);
    globe.setStates(states, { ba: at(6, 4) });
    globe.setStates(states, { ba: at(6, 4) }, { animate: true });
    expect(clock.pending).toBe(0);
  });

  it('another state, or none, never tweens from the previous one', async () => {
    const clock = new ManualClock();
    const { fake, globe } = await mounted(clock);
    globe.setMunicipalities('BA', munis, { 1: at(6, 4) });
    const other: AreaCollection = { type: 'FeatureCollection', features: [square(-50, -25, { id: '1' })] };
    globe.setMunicipalities('PR', other, { 1: at(3, 7) }, { animate: true });
    expect(clock.pending).toBe(0);
    globe.setMunicipalities('PR', other, { 1: at(4, 6) }, { animate: true });
    expect(clock.pending).toBe(1);
    globe.setMunicipalities(null, null, {}, { animate: true });
    expect(clock.pending).toBe(0);
    expect((fake.data.muni as AreaCollection).features).toEqual([]);
  });

  it('a call without animate mid-tween cancels it and draws the new numbers', async () => {
    const clock = new ManualClock();
    const { fake, globe } = await mounted(clock);
    globe.setStates(states, { ba: at(6, 4) });
    globe.setStates(states, { ba: at(3, 7) }, { animate: true });
    clock.step(100);
    globe.setStates(states, { ba: at(5, 5) });
    expect(clock.pending).toBe(0);
    expect(westEdge(fake)).toBeCloseTo(-41.5);
  });

  it('tweens country leader colours on overseas pieces and city dots', async () => {
    const clock = new ManualClock();
    const { fake, globe } = await mounted(clock);
    globe.setWorld(japan, { '392': at(6, 4) });
    globe.setAbroadCities(tokyo, { '30627': at(6, 4) });
    globe.setWorld(japan, { '392': at(3, 7) }, { animate: true });
    globe.setAbroadCities(tokyo, { '30627': at(3, 7) }, { animate: true });
    clock.step(100);
    const world = (fake.data.world as AreaCollection).features.map((f) => f.properties);
    expect(world.some((p) => p?.side === 'W')).toBe(true);
    expect((fake.data.cities as AreaCollection).features[0].properties?.side).toBe('W');
    clock.run(50);
    expect((fake.data.cities as AreaCollection).features[0].properties?.side).toBe('R');
    expect((fake.data.world as AreaCollection).features.map((f) => f.properties?.side)).toEqual(['L', 'R', 'L', 'R', 'R']);
  });

  it('first-round solid fills never tween', async () => {
    const clock = new ManualClock();
    const { globe } = await mounted(clock);
    globe.setStates(states, { ba: { fill: '#d7262d', el: 1 } });
    globe.setStates(states, { ba: { fill: '#1f5fe0', el: 1 } }, { animate: true });
    expect(clock.pending).toBe(0);
  });

  it('a redraw that costs too much ends the tween at once', async () => {
    const clock = new ManualClock();
    const { fake, globe } = await mounted(clock);
    globe.setStates(states, { ba: at(6, 4) });
    globe.setStates(states, { ba: at(3, 7) }, { animate: true });
    const real = fake.getSource;
    fake.getSource = (id: string) => ({ setData: (d: unknown) => { clock.t += 30; real(id).setData(d); } });
    clock.step(16);
    expect(clock.pending).toBe(0);
    expect(westEdge(fake)).toBeCloseTo(-41.7);
  });

  it('too many changed areas skip the tween', async () => {
    const clock = new ManualClock();
    const { globe } = await mounted(clock);
    const many: AreaCollection = { type: 'FeatureCollection', features: Array.from({ length: MAX_TWEEN_AREAS + 1 }, (_, i) => square(i % 50, Math.floor(i / 50), { id: String(i) })) };
    const items = (l: number) => Object.fromEntries(many.features.map((f) => [String(f.properties?.id), at(l, 10 - l)]));
    globe.setMunicipalities('MG', many, items(6));
    globe.setMunicipalities('MG', many, items(4), { animate: true });
    expect(clock.pending).toBe(0);
  });

  it('frame spacing grows with the cost of a redraw, within bounds', () => {
    expect(frameInterval(0)).toBe(33);
    expect(frameInterval(20)).toBe(80);
    expect(frameInterval(100)).toBe(160);
  });

  it('countries without numbers, or across the antimeridian, stay whole', async () => {
    const { fake, globe } = await mounted();
    const fiji: AreaCollection = { type: 'FeatureCollection', features: [
      square(10, 10, { iso: 1 }),
      { ...square(0, 0, { iso: 242 }), geometry: { type: 'Polygon' as const, coordinates: [[[-179, -17], [179, -17], [179, -16], [-179, -16], [-179, -17]]] } },
    ] };
    globe.setWorld(fiji, { '242': at(6, 4) });
    expect((fake.data.world as AreaCollection).features.map((f) => f.properties)).toEqual([{ iso: 1, side: 'X' }, { iso: 242, side: 'L' }]);
    globe.setWorld(fiji, { '242': at(6, 4) }); // geometry already cut: reused
    expect((fake.data.world as AreaCollection).features).toHaveLength(2);
  });

  it('a city without numbers is a grey dot of size zero', async () => {
    const { fake, globe } = await mounted();
    globe.setAbroadCities(tokyo, {});
    expect((fake.data.cities as AreaCollection).features[0].properties).toEqual({ cd: '30627', iso: 392, el: 0, side: 'X' });
  });

  it('uses the browser frame clock by default', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const { globe } = await mounted();
    globe.setStates(states, { ba: at(6, 4) });
    globe.setStates(states, { ba: at(3, 7) }, { animate: true });
    expect(raf).toHaveBeenCalled();
    raf.mockRestore();
  });
});
