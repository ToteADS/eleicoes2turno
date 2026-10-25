import type { AreaResult, MultiResult, Round1Summary, Summary } from '../domain/types';
import type { AreaCollection, AreaPaint, GlobeHover, GlobePick, GlobeRenderer, GlobeView, Padding, RotationController } from '../infra/globe';
import { createApp, type AppDeps } from './app';

const r = (l: number, f: number): AreaResult => ({ el: 10, comp: 8, abst: 2, vv: l + f, vb: 0, vn: 0, l, f, st: 1, ts: 1, dg: '25/10/2026', hg: '17:30:00', released: true });
const summary: Summary = {
  updatedAt: '2026-10-25T20:30:00Z', stale: false, candidates: [],
  br: r(6, 4), brUfsSum: r(6, 4), zz: r(1, 1), ufs: { ba: r(7, 3) }, countries: { '392': r(1, 3) },
};
const m = (votes: number[]): MultiResult => ({ el: 10, comp: 8, abst: 2, vv: votes.reduce((a, b) => a + b, 0), vb: 0, vn: 0, st: 1, ts: 1, dg: '05/10/2026', hg: '12:51:47', released: true, votes });
const round1: Round1Summary = {
  dg: '05/10/2026', hg: '12:51:47',
  candidates: [
    { n: 22, name: 'Flávio Bolsonaro', party: 'PL', sqcand: '1', runoff: true },
    { n: 13, name: 'Lula', party: 'PT', sqcand: '2', runoff: true },
    { n: 70, name: 'Augusto Cury', party: 'AVANTE', sqcand: '3', runoff: false },
  ],
  br: m([5, 4, 1]), brUfsSum: m([5, 4, 1]), zz: m([1, 1, 0]), ufs: { ba: m([2, 7, 1]) }, countries: { '392': m([3, 1, 0]) },
};
const area = (props: Record<string, unknown>) => ({
  type: 'Feature' as const, properties: props,
  geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
});
const states: AreaCollection = { type: 'FeatureCollection', features: [area({ uf: 'BA', name: 'Bahia' })] };
const munis: AreaCollection = { type: 'FeatureCollection', features: [area({ id: '2900207', name: 'Abaré' })] };

class FakeGlobe implements GlobeRenderer {
  views: GlobeView[] = [];
  states: Record<string, AreaPaint> = {};
  munis: Record<string, AreaPaint> = {};
  pick?: (p: GlobePick) => void;
  hover?: (h: GlobeHover | null) => void;
  rotation: RotationController = { running: false, start() {}, stop() {}, toggle: () => true, onChange() {} };
  mount = () => Promise.resolve();
  setWorld() {}
  setStates(_s: AreaCollection, ufs: Record<string, AreaPaint>) { this.states = ufs; }
  setMunicipalities(_uf: string | null, _g: AreaCollection | null, items: Record<string, AreaPaint>) { this.munis = items; }
  setAbroadCities() {}
  focus(v: GlobeView) { this.views.push(v); }
  setPadding(_p: Padding) {}
  onPick(cb: (p: GlobePick) => void) { this.pick = cb; }
  onHover(cb: (h: GlobeHover | null) => void) { this.hover = cb; }
  onUserInteract() {}
  zoomIn() {}
  zoomOut() {}
}

function deps(globe: FakeGlobe, calls: string[], presence: AppDeps['api']['presence'] = () => Promise.resolve({ online: 3 })): AppDeps {
  return {
    root: document.body,
    globe,
    api: {
      summary: () => { calls.push('summary'); return Promise.resolve(summary); },
      municipalities: (uf: string) => { calls.push('mun:' + uf); return Promise.resolve({ updatedAt: '', items: { '2900207': r(1, 1) } }); },
      abroadCities: () => Promise.resolve({ updatedAt: '', items: {} }),
      presence,
      config: () => Promise.resolve({ ads: { adsenseClient: '', slotResults: '', slotMobile: '', house: { image: '/a.svg', link: 'https://tapp.solutions', alt: 'Tapp' } } }),
    },
    geo: {
      states: () => Promise.resolve(states),
      world: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
      municipalities: () => Promise.resolve(munis),
      abroadCities: () => Promise.resolve([{ cd: '30627', nm: 'Tóquio', country: 'Japão', iso: 392, lat: 35, lon: 139 }]),
    },
    round1: {
      summary: () => { calls.push('r1:summary'); return Promise.resolve(round1); },
      municipalities: (uf: string) => { calls.push('r1:mun:' + uf); return Promise.resolve({ '2900207': m([1, 3, 0]) }); },
      abroadCities: () => Promise.resolve({ '30627': m([4, 1, 0]) }),
    },
    pollMs: 60_000,
    tabId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  };
}

const flush = () => new Promise((res) => setTimeout(res, 0));

describe('app', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
  });

  it('starts on all countries spinning over Brazil', async () => {
    const globe = new FakeGlobe();
    const app = await createApp(deps(globe, []));
    expect(globe.views[0]).toEqual({ kind: 'all' });
    expect((document.querySelector('#fCountry') as HTMLSelectElement).value).toBe('ALL');
    expect(document.body.textContent).toContain('Todos os países');
    app.dispose();
  });

  it('shows the online counter in the top bar and stops its heartbeat on dispose', async () => {
    const sent: unknown[] = [];
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const app = await createApp(deps(new FakeGlobe(), [], (dto) => { sent.push(dto.toJson()); return Promise.resolve({ online: 3 }); }));
      await flush();
      const pill = document.querySelector<HTMLElement>('#topbar .online')!;
      expect(pill.hidden).toBe(false);
      expect(pill.textContent).toBe('3 pessoas online agora');
      expect(sent).toEqual([{ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }]);
      app.dispose();
      vi.advanceTimersByTime(5 * 60_000);
      expect(sent).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
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

  it('still shows results when the globe cannot start (no WebGL)', async () => {
    const globe = new FakeGlobe();
    globe.mount = () => Promise.reject(new Error('WebGL not supported'));
    const app = await createApp(deps(globe, []));
    expect(document.querySelector('.scope')?.textContent).toBe('Todos os países');
    expect(document.body.textContent).toContain('Globo indisponível');
    app.dispose();
  });

  it('a failed state map clears the previous state instead of keeping it', async () => {
    const globe = new FakeGlobe();
    const d = deps(globe, []);
    let fail = false;
    d.geo.municipalities = () => (fail ? Promise.reject(new Error('404')) : Promise.resolve(munis));
    const app = await createApp(d);
    globe.pick!({ kind: 'uf', uf: 'BA' });
    await flush();
    fail = true;
    globe.pick!({ kind: 'uf', uf: 'SP' });
    await flush();
    expect(globe.views.at(-1)).toEqual({ kind: 'uf', uf: 'SP' });
    expect(document.querySelectorAll('#cityList option')).toHaveLength(0);
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

  it('opens the first round from the URL with its own card and winner colors', async () => {
    history.replaceState(null, '', '/?turno=1');
    const globe = new FakeGlobe();
    const calls: string[] = [];
    const app = await createApp(deps(globe, calls));
    const r1 = document.querySelector<HTMLElement>('.results-r1')!;
    expect(r1.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('.results-r2')!.hidden).toBe(true);
    expect(r1.querySelector('.c1')?.getAttribute('data-cand')).toBe('22');
    expect(r1.querySelector('.updated')?.textContent).toContain('Resultado final');
    expect(document.querySelector('[data-round="1"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.topbar h1')?.textContent).toContain('1º turno');
    expect(globe.states.ba).toEqual({ fill: expect.stringMatching(/^#/), el: 10 });
    expect(calls).toContain('r1:summary');
    app.dispose();
  });

  it('switching round keeps the filters, updates the URL and repaints', async () => {
    const globe = new FakeGlobe();
    const calls: string[] = [];
    const app = await createApp(deps(globe, calls));
    globe.pick!({ kind: 'uf', uf: 'BA' });
    await flush();
    expect(globe.munis['2900207']).toEqual(r(1, 1));
    document.querySelector<HTMLButtonElement>('[data-round="1"]')!.click();
    await flush();
    expect(location.search).toBe('?turno=1');
    expect((document.querySelector('#fUf') as HTMLSelectElement).value).toBe('BA');
    expect(document.querySelector('.results-r1 .scope')?.textContent).toBe('Bahia');
    expect(document.querySelector('.results-r1 .c1')?.getAttribute('data-cand')).toBe('13');
    expect(calls).toContain('r1:mun:BA');
    expect(globe.munis['2900207']).toEqual({ fill: expect.stringMatching(/^#/), el: 10 });
    document.querySelector<HTMLButtonElement>('[data-round="2"]')!.click();
    await flush();
    expect(location.search).toBe('');
    expect(document.querySelector<HTMLElement>('.results-r2')!.hidden).toBe(false);
    expect(globe.munis['2900207']).toEqual(r(1, 1));
    app.dispose();
  });

  it('the first round does not poll', async () => {
    vi.useFakeTimers();
    try {
      history.replaceState(null, '', '/?turno=1');
      const globe = new FakeGlobe();
      const calls: string[] = [];
      const p = createApp(deps(globe, calls));
      await vi.runOnlyPendingTimersAsync();
      const app = await p;
      const before = calls.filter((c) => c === 'summary').length;
      await vi.advanceTimersByTimeAsync(180_000);
      expect(calls.filter((c) => c === 'summary').length).toBe(before);
      app.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows how long ago the summary was checked, ticking on its own', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-25T20:30:00Z'));
      const app = await createApp(deps(new FakeGlobe(), []));
      const line = document.querySelector<HTMLElement>('.results-r2 .updated')!;
      expect(line.textContent).toBe('Atualizado pelo TSE às 17:30verificado há 0 s');
      vi.advanceTimersByTime(12_000);
      expect(line.querySelector('.checked')?.textContent).toBe('verificado há 12 s');
      vi.advanceTimersByTime(48_000); // the 60 s poll succeeds and resets the age
      await flush();
      expect(line.querySelector('.checked')?.textContent).toBe('verificado há 0 s');
      vi.advanceTimersByTime(3_000);
      expect(line.querySelector('.checked')?.textContent).toBe('verificado há 3 s');
      app.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the first round does not show the checked label', async () => {
    history.replaceState(null, '', '/?turno=1');
    const app = await createApp(deps(new FakeGlobe(), []));
    expect(document.querySelector('.results-r1')?.textContent).not.toContain('verificado');
    expect(document.querySelector<HTMLElement>('.results-r2')!.hidden).toBe(true);
    app.dispose();
  });

  describe('tab visibility', () => {
    let state: DocumentVisibilityState = 'visible';
    beforeAll(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state }));
    afterAll(() => { delete (document as { visibilityState?: unknown }).visibilityState; });
    beforeEach(() => { state = 'visible'; });
    const show = (s: DocumentVisibilityState) => {
      state = s;
      document.dispatchEvent(new Event('visibilitychange'));
    };

    it('polls right away when the tab becomes visible again, and not after dispose', async () => {
      const calls: string[] = [];
      const app = await createApp(deps(new FakeGlobe(), calls));
      const count = () => calls.filter((c) => c === 'summary').length;
      expect(count()).toBe(1);
      show('hidden');
      await flush();
      expect(count()).toBe(1);
      show('visible');
      await flush();
      expect(count()).toBe(2);
      app.dispose();
      show('hidden');
      show('visible');
      await flush();
      expect(count()).toBe(2);
    });

    it('does not start a second poll while one is in flight', async () => {
      const d = deps(new FakeGlobe(), []);
      let pending = 0;
      let release: () => void = () => {};
      const app = await createApp(d);
      d.api.summary = () => {
        pending++;
        return new Promise((res) => { release = () => res(summary); });
      };
      show('visible');
      show('visible');
      await flush();
      expect(pending).toBe(1);
      release();
      await flush();
      show('visible');
      await flush();
      expect(pending).toBe(2);
      release();
      await flush();
      app.dispose();
    });

    it('the first round ignores the tab coming back', async () => {
      history.replaceState(null, '', '/?turno=1');
      const calls: string[] = [];
      const app = await createApp(deps(new FakeGlobe(), calls));
      show('visible');
      await flush();
      expect(calls).not.toContain('summary');
      app.dispose();
    });
  });

  it('first-round hover shows the ranking of the area', async () => {
    history.replaceState(null, '', '/?turno=1');
    const globe = new FakeGlobe();
    const app = await createApp(deps(globe, []));
    globe.hover!({ kind: 'uf', uf: 'BA', x: 1, y: 1 });
    expect(document.querySelector('.tip')?.textContent).toContain('Lula70,0%');
    globe.hover!({ kind: 'country', iso: 392, x: 1, y: 1 });
    expect(document.querySelector('.tip')?.textContent).toContain('Flávio Bolsonaro75,0%');
    globe.hover!({ kind: 'abroadCity', cd: '30627', x: 1, y: 1 });
    expect(document.querySelector('.tip')?.textContent).toContain('Tóquio · Japão');
    globe.pick!({ kind: 'uf', uf: 'BA' });
    await flush();
    globe.hover!({ kind: 'municipality', id: '2900207', x: 1, y: 1 });
    expect(document.querySelector('.tip')?.textContent).toContain('Abaré');
    globe.hover!(null);
    expect(document.querySelector('.tip')?.classList.contains('on')).toBe(false);
    app.dispose();
  });

  it('shows no data when the first-round snapshot is missing', async () => {
    history.replaceState(null, '', '/?turno=1');
    const globe = new FakeGlobe();
    const d = deps(globe, []);
    d.round1.summary = () => Promise.reject(new Error('404'));
    const app = await createApp(d);
    expect(document.querySelector('.results-r1 .status')?.textContent).toContain('Sem dados');
    expect(globe.states).toEqual({});
    app.dispose();
  });

  it('starting on the first round loads the second only when asked, and hovers follow the round', async () => {
    history.replaceState(null, '', '/?turno=1');
    const globe = new FakeGlobe();
    const calls: string[] = [];
    const app = await createApp(deps(globe, calls));
    expect(calls).not.toContain('summary');
    document.querySelector<HTMLButtonElement>('[data-round="2"]')!.click();
    await flush();
    expect(calls).toContain('summary');
    expect(globe.states.ba).toEqual(r(7, 3));
    globe.hover!({ kind: 'uf', uf: 'BA', x: 1, y: 1 });
    expect(document.querySelector('.tip')?.textContent).toContain('Lula70,0%');
    globe.hover!({ kind: 'abroadCity', cd: '30627', x: 1, y: 1 });
    expect(document.querySelector('.tip')?.textContent).toContain('Tóquio');
    app.dispose();
  });

  it('a quick double switch ends on the last round chosen', async () => {
    const globe = new FakeGlobe();
    const app = await createApp(deps(globe, []));
    globe.pick!({ kind: 'uf', uf: 'BA' });
    await flush();
    document.querySelector<HTMLButtonElement>('[data-round="1"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-round="2"]')!.click();
    await flush();
    await flush();
    expect(document.querySelector<HTMLElement>('.results-r2')!.hidden).toBe(false);
    expect(globe.munis['2900207']).toEqual(r(1, 1));
    app.dispose();
  });

  it('first-round files that fail to load leave the areas without data', async () => {
    history.replaceState(null, '', '/?turno=1');
    const globe = new FakeGlobe();
    const d = deps(globe, []);
    d.round1.abroadCities = () => Promise.reject(new Error('404'));
    d.round1.municipalities = () => Promise.reject(new Error('404'));
    const app = await createApp(d);
    globe.pick!({ kind: 'uf', uf: 'BA' });
    await flush();
    expect(globe.munis).toEqual({});
    expect(document.querySelector('.results-r1 .scope')?.textContent).toBe('Bahia');
    app.dispose();
  });

  it('a failed second-round municipality list leaves the state without data', async () => {
    const globe = new FakeGlobe();
    const d = deps(globe, []);
    d.api.municipalities = () => Promise.reject(new Error('503'));
    const app = await createApp(d);
    globe.pick!({ kind: 'uf', uf: 'BA' });
    await flush();
    expect(globe.munis).toEqual({});
    app.dispose();
  });

  it('a round switch loses to a newer round or state chosen while it loads', async () => {
    const globe = new FakeGlobe();
    const app = await createApp(deps(globe, []));
    globe.pick!({ kind: 'uf', uf: 'BA' });
    await flush();
    const round = (n: number) => document.querySelector<HTMLButtonElement>(`[data-round="${n}"]`)!.click();
    round(1);
    await flush();
    round(2);
    await flush();
    // first round already loaded: the switch goes straight to the municipalities
    round(1);
    round(2);
    await flush();
    expect(document.querySelector<HTMLElement>('.results-r2')!.hidden).toBe(false);
    expect(globe.munis['2900207']).toEqual(r(1, 1));
    round(1);
    globe.pick!({ kind: 'uf', uf: 'SP' });
    await flush();
    await flush();
    expect(globe.views.at(-1)).toEqual({ kind: 'uf', uf: 'SP' });
    expect(document.querySelector<HTMLElement>('.results-r1')!.hidden).toBe(false);
    app.dispose();
  });
});
