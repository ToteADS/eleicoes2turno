import type { AreaResult, Summary } from '../domain/types';
import type { AreaCollection, GlobeHover, GlobePick, GlobeRenderer, GlobeView, Padding, RotationController } from '../infra/globe';
import { createApp, type AppDeps } from './app';

const r = (l: number, f: number): AreaResult => ({ el: 10, comp: 8, abst: 2, vv: l + f, vb: 0, vn: 0, l, f, st: 1, ts: 1, dg: '25/10/2026', hg: '17:30:00', released: true });
const summary: Summary = {
  updatedAt: '2026-10-25T20:30:00Z', stale: false, candidates: [],
  br: r(6, 4), brUfsSum: r(6, 4), zz: r(1, 1), ufs: { ba: r(7, 3) }, countries: { '392': r(1, 3) },
};
const area = (props: Record<string, unknown>) => ({
  type: 'Feature' as const, properties: props,
  geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
});
const states: AreaCollection = { type: 'FeatureCollection', features: [area({ uf: 'BA', name: 'Bahia' })] };
const munis: AreaCollection = { type: 'FeatureCollection', features: [area({ id: '2900207', name: 'Abaré' })] };

class FakeGlobe implements GlobeRenderer {
  views: GlobeView[] = [];
  pick?: (p: GlobePick) => void;
  rotation: RotationController = { running: false, start() {}, stop() {}, toggle: () => true, onChange() {} };
  mount = () => Promise.resolve();
  setWorld() {}
  setStates() {}
  setMunicipalities() {}
  setAbroadCities() {}
  focus(v: GlobeView) { this.views.push(v); }
  setPadding(_p: Padding) {}
  onPick(cb: (p: GlobePick) => void) { this.pick = cb; }
  onHover(_cb: (h: GlobeHover | null) => void) {}
  onUserInteract() {}
  zoomIn() {}
  zoomOut() {}
}

function deps(globe: FakeGlobe, calls: string[]): AppDeps {
  return {
    root: document.body,
    globe,
    api: {
      summary: () => { calls.push('summary'); return Promise.resolve(summary); },
      municipalities: (uf: string) => { calls.push('mun:' + uf); return Promise.resolve({ updatedAt: '', items: { '2900207': r(1, 1) } }); },
      abroadCities: () => Promise.resolve({ updatedAt: '', items: {} }),
      config: () => Promise.resolve({ ads: { adsenseClient: '', slotResults: '', slotMobile: '', house: { image: '/a.svg', link: 'https://tapp.solutions', alt: 'Tapp' } } }),
    },
    geo: {
      states: () => Promise.resolve(states),
      world: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
      municipalities: () => Promise.resolve(munis),
      abroadCities: () => Promise.resolve([{ cd: '30627', nm: 'Tóquio', country: 'Japão', iso: 392, lat: 35, lon: 139 }]),
    },
    pollMs: 60_000,
  };
}

const flush = () => new Promise((res) => setTimeout(res, 0));

describe('app', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('starts on all countries spinning over Brazil', async () => {
    const globe = new FakeGlobe();
    const app = await createApp(deps(globe, []));
    expect(globe.views[0]).toEqual({ kind: 'all' });
    expect((document.querySelector('#fCountry') as HTMLSelectElement).value).toBe('ALL');
    expect(document.body.textContent).toContain('Todos os países');
    app.dispose();
  });

  it('choosing a state focuses it and loads its municipalities once', async () => {
    const globe = new FakeGlobe();
    const calls: string[] = [];
    const app = await createApp(deps(globe, calls));
    const uf = document.querySelector('#fUf') as HTMLSelectElement;
    uf.value = 'BA';
    uf.dispatchEvent(new Event('change'));
    await flush();
    expect(globe.views.at(-1)).toEqual({ kind: 'uf', uf: 'BA' });
    expect(calls.filter((c) => c === 'mun:BA')).toHaveLength(1);
    expect(document.querySelector('.scope')?.textContent).toBe('Bahia');
    app.dispose();
  });

  it('picking a country on the globe updates the country filter', async () => {
    const globe = new FakeGlobe();
    const app = await createApp(deps(globe, []));
    globe.pick!({ kind: 'country', iso: 392 });
    await flush();
    expect((document.querySelector('#fCountry') as HTMLSelectElement).value).toBe('392');
    expect(globe.views.at(-1)).toEqual({ kind: 'country', iso: 392 });
    app.dispose();
  });

  it('picking a municipality selects the city', async () => {
    const globe = new FakeGlobe();
    const app = await createApp(deps(globe, []));
    globe.pick!({ kind: 'uf', uf: 'BA' });
    await flush();
    globe.pick!({ kind: 'municipality', id: '2900207' });
    await flush();
    expect(globe.views.at(-1)).toEqual({ kind: 'municipality', uf: 'BA', id: '2900207' });
    expect(document.querySelector('.scope')?.textContent).toBe('Abaré');
    app.dispose();
  });
});
