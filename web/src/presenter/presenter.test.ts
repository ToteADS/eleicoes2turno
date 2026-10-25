import { sumResults } from '../domain/aggregate';
import type { AbroadCity, AreaResult, PublicConfig, Summary } from '../domain/types';
import { setLocale } from '../i18n';
import { AdSlot } from './ad-slot';
import { describeScope, type ScopeData } from './scope';
import { ResultsCard } from './results-card';
import { isStale } from './staleness';

const r = (l: number, f: number, released = true, extra: Partial<AreaResult> = {}): AreaResult => ({
  el: 1000, comp: 800, abst: 200, vv: l + f, vb: 10, vn: 20, l, f, st: 5, ts: 10, dg: '25/10/2026', hg: '17:30:00', released, ...extra,
});

const summary: Summary = {
  updatedAt: '2026-10-25T20:30:00Z', stale: false,
  candidates: [
    { n: 22, name: 'FLAVIO BOLSONARO', party: 'PL', sqcand: '280002551544' },
    { n: 13, name: 'LULA', party: 'PT', sqcand: '280002542548' },
  ],
  br: r(600, 400), brUfsSum: r(590, 400), zz: r(10, 0),
  ufs: { ba: r(70, 30), pr: r(30, 70), sc: r(20, 80) }, countries: { '392': r(25, 75) },
};
const cities: AbroadCity[] = [
  { cd: '30627', nm: 'Tóquio', country: 'Japão', iso: 392, lat: 0, lon: 0 },
  { cd: '30198', nm: 'Nagóia', country: 'Japão', iso: 392, lat: 0, lon: 0 },
];
const data = (extra: Partial<ScopeData> = {}): ScopeData => ({
  summary, stateNames: { BA: 'Bahia', PR: 'Paraná', SC: 'Santa Catarina' }, abroadCities: cities,
  municipalities: {}, municipalityNames: {}, municipalityCount: 0, abroadResults: {}, ...extra,
});

beforeEach(() => setLocale('pt'));

describe('sumResults', () => {
  it('adds areas and keeps the latest TSE time', () => {
    const s = sumResults([r(1, 2, false, { hg: '17:00:00' }), r(3, 4, true, { hg: '18:00:00' })]);
    expect([s.l, s.f, s.el, s.released, s.hg]).toEqual([4, 6, 2000, true, '18:00:00']);
  });
  it('empty sum is not released', () => {
    expect(sumResults([]).released).toBe(false);
  });
});

describe('describeScope', () => {
  it('all countries uses the official BR total', () => {
    const s = describeScope({ country: 'ALL', region: 'ALL', uf: null, city: null }, data());
    expect(s.title).toBe('Todos os países');
    expect(s.result).toBe(summary.br);
    expect(s.sub).toContain('Total oficial');
  });
  it('Brazil is labelled as a sum of the states', () => {
    const s = describeScope({ country: 'BR', region: 'ALL', uf: null, city: null }, data());
    expect(s.result).toBe(summary.brUfsSum);
    expect(s.sub).toContain('Soma das UFs');
  });
  it('a region sums its states', () => {
    const s = describeScope({ country: 'BR', region: 'S', uf: null, city: null }, data());
    expect(s.title).toBe('Sul');
    expect(s.result?.l).toBe(50);
  });
  it('a state uses its own TSE result', () => {
    const s = describeScope({ country: 'BR', region: 'NE', uf: 'BA', city: null }, data({ municipalityCount: 417 }));
    expect([s.title, s.crumb, s.result]).toEqual(['Bahia', 'Brasil › Nordeste', summary.ufs.ba]);
    expect(s.sub).toContain('417 municípios');
  });
  it('a municipality', () => {
    const s = describeScope({ country: 'BR', region: 'NE', uf: 'BA', city: '2900207' },
      data({ municipalities: { '2900207': r(1, 1) }, municipalityNames: { '2900207': 'Abaré' } }));
    expect([s.title, s.crumb]).toEqual(['Abaré', 'Brasil › Nordeste › Bahia']);
  });
  it('a country abroad is a sum of its cities', () => {
    const s = describeScope({ country: 392, region: 'ALL', uf: null, city: null }, data());
    expect([s.title, s.crumb, s.result]).toEqual(['Japão', 'Exterior', summary.countries['392']]);
    expect(s.sub).toContain('Soma das cidades');
  });
  it('an abroad city', () => {
    const s = describeScope({ country: 392, region: 'ALL', uf: null, city: '30627' }, data({ abroadResults: { '30627': r(1, 2) } }));
    expect([s.title, s.crumb]).toEqual(['Tóquio', 'Exterior › Japão']);
  });
});

describe('ResultsCard', () => {
  const scope = { crumb: '', title: 'Brasil', sub: 'x', result: r(600, 400) };
  it('shows percentages and who leads', () => {
    const el = document.createElement('div');
    new ResultsCard(el).render(scope, summary.candidates, false, '');
    expect(el.querySelector('[data-cand="13"] .pc')?.textContent).toBe('60,00%');
    expect(el.querySelector('[data-cand="22"] .pc')?.textContent).toBe('40,00%');
    expect(el.querySelector('[data-cand="13"] .lead')?.hasAttribute('hidden')).toBe(false);
    expect(el.querySelector('[data-cand="22"] .lead')?.hasAttribute('hidden')).toBe(true);
    expect(el.querySelector('[data-cand="13"] img')?.getAttribute('src')).toContain('280002542548.jpeg');
  });
  it('waits for the TSE before 17h', () => {
    const el = document.createElement('div');
    new ResultsCard(el).render({ ...scope, result: r(0, 0, false) }, summary.candidates, false, '');
    expect(el.textContent).toContain('Aguardando divulgação');
    expect(el.querySelector('[data-cand="13"] .pc')?.textContent).toBe('–');
    expect(el.querySelector('[data-cand="13"] .lead')?.hasAttribute('hidden')).toBe(true);
  });
  it('says when there is no data', () => {
    const el = document.createElement('div');
    new ResultsCard(el).render({ ...scope, result: undefined }, summary.candidates, false, '');
    expect(el.textContent).toContain('Sem dados');
  });
  it('warns when data is stale', () => {
    const el = document.createElement('div');
    new ResultsCard(el).render(scope, summary.candidates, true, '17:31');
    expect(el.textContent).toContain('TSE instável');
  });
});

describe('AdSlot', () => {
  const config: PublicConfig = { ads: { adsenseClient: '', slotResults: '', slotMobile: '',
    house: { image: '/ads/tapp-banner-v2.svg', link: 'https://tapp.solutions', alt: 'Tapp Solutions' } } };
  it('renders the house banner', () => {
    const el = document.createElement('div');
    new AdSlot(el, 'results').render(config);
    const a = el.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://tapp.solutions');
    expect(a?.getAttribute('rel')).toContain('sponsored');
    expect(el.textContent).toContain('Publicidade');
  });
  it('renders AdSense when configured', () => {
    const el = document.createElement('div');
    new AdSlot(el, 'mobile').render({ ads: { ...config.ads, adsenseClient: 'ca-pub-9424129340132469', slotMobile: '123' } });
    const ins = el.querySelector('ins.adsbygoogle');
    expect(ins?.getAttribute('data-ad-client')).toBe('ca-pub-9424129340132469');
    expect(ins?.getAttribute('data-ad-slot')).toBe('123');
    expect(document.querySelectorAll('script[src*="adsbygoogle.js"]').length).toBe(1);
  });
  it('rotates between the house banner and the partner banners', () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement('div');
      const partner = { image: '/ads/onlide-banner.svg', link: 'https://onlidegestao.com.br', alt: 'OnLide' };
      const slot = new AdSlot(el, 'results', { partners: [partner], rotateMs: 15_000 });
      slot.render(config);
      const href = () => el.querySelector('a')?.getAttribute('href');
      expect(href()).toBe('https://tapp.solutions');
      vi.advanceTimersByTime(15_000);
      expect(href()).toBe('https://onlidegestao.com.br');
      expect(el.querySelector('img')?.getAttribute('alt')).toBe('OnLide');
      vi.advanceTimersByTime(15_000);
      expect(href()).toBe('https://tapp.solutions');
      slot.stop();
      vi.advanceTimersByTime(15_000);
      expect(href()).toBe('https://tapp.solutions');
    } finally {
      vi.useRealTimers();
    }
  });
  it('ships OnLide as a partner banner by default', () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement('div');
      new AdSlot(el, 'results').render(config);
      vi.advanceTimersByTime(15_000);
      expect(el.querySelector('a')?.getAttribute('href')).toBe('https://onlidegestao.com.br');
    } finally {
      vi.useRealTimers();
    }
  });
  it('falls back to the house banner when AdSense has no slot for the placement', () => {
    const el = document.createElement('div');
    new AdSlot(el, 'results').render({ ads: { ...config.ads, adsenseClient: 'ca-pub-1', slotMobile: '123' } });
    expect(el.querySelector('ins')).toBeNull();
    expect(el.querySelector('a')).not.toBeNull();
  });
});

describe('ResultsCard tie', () => {
  it('shows no leader on an exact tie', () => {
    const el = document.createElement('div');
    new ResultsCard(el).render({ crumb: '', title: 'x', sub: '', result: r(500, 500) }, summary.candidates, false, '');
    expect(el.querySelector('[data-cand="13"] .lead')?.hasAttribute('hidden')).toBe(true);
    expect(el.querySelector('[data-cand="22"] .lead')?.hasAttribute('hidden')).toBe(true);
  });
});

describe('isStale', () => {
  const now = Date.parse('2026-10-25T20:31:00Z');
  it('fresh data with no failures is not stale', () => {
    expect(isStale(summary, 0, now)).toBe(false);
  });
  it('stale when the API flagged it', () => {
    expect(isStale({ ...summary, stale: true }, 0, now)).toBe(true);
  });
  it('stale after two failed polls', () => {
    expect(isStale(summary, 2, now)).toBe(true);
  });
  it('stale when our data is older than two minutes', () => {
    expect(isStale(summary, 0, Date.parse('2026-10-25T20:33:01Z'))).toBe(true);
  });
  it('no summary is not reported as stale', () => {
    expect(isStale(null, 5, now)).toBe(false);
  });
});
