import { ranking, sumMulti } from '../domain/multi';
import type { MultiResult, Round1Candidate, Round1Summary } from '../domain/types';
import { setLocale } from '../i18n';
import { CandidateList } from './candidate-list';
import { Round1Card } from './round1-card';
import { round1Fills } from './round1-paint';
import { RoundToggle } from './round-toggle';
import { readRound, roundUrl } from './round-url';
import { resultRows } from './result-rows';
import { describeScope } from './scope';
import { Tooltip } from './tooltip';

const m = (votes: number[], extra: Partial<MultiResult> = {}): MultiResult => ({
  el: 1000, comp: 800, abst: 200, vv: votes.reduce((a, b) => a + b, 0), vb: 10, vn: 20, st: 10, ts: 10,
  dg: '05/10/2026', hg: '12:51:47', released: true, votes, ...extra,
});
const names = ['Flávio Bolsonaro', 'Lula', 'Augusto Cury', 'Renan Santos', 'Ronaldo Caiado', 'Zema', 'Samara'];
const nums = [22, 13, 70, 14, 55, 30, 80];
const parties = ['PL', 'PT', 'AVANTE', 'MISSÃO', 'PSD', 'NOVO', 'UP'];
const cands: Round1Candidate[] = names.map((name, i) => ({ n: nums[i], name, party: parties[i], sqcand: String(100 + i), runoff: i < 2 }));
const r1: Round1Summary = {
  dg: '05/10/2026', hg: '12:51:47', candidates: cands,
  br: m([47, 45, 3, 2, 2, 1, 0]), brUfsSum: m([46, 45, 3, 2, 2, 1, 0]), zz: m([1, 1]),
  ufs: { ba: m([20, 70, 5, 2, 2, 1, 0]), pr: m([60, 30]), sc: m([70, 20]) }, countries: { '392': m([80, 20]) },
};

beforeEach(() => setLocale('pt'));

describe('round in the URL', () => {
  it('reads the round, defaulting to the second', () => {
    expect(readRound('?turno=1')).toBe(1);
    expect(readRound('?x=1&turno=2')).toBe(2);
    expect(readRound('')).toBe(2);
    expect(readRound('?turno=7')).toBe(2);
  });
  it('writes the first round and drops the parameter for the second', () => {
    expect(roundUrl('https://x.test/?a=1#h', 1)).toBe('/?a=1&turno=1#h');
    expect(roundUrl('https://x.test/?turno=1&a=1', 2)).toBe('/?a=1');
    expect(roundUrl('https://x.test/p?turno=1', 2)).toBe('/p');
  });
});

describe('RoundToggle', () => {
  it('marks the current round and reports a change once', () => {
    const el = document.createElement('div');
    const toggle = new RoundToggle(el);
    const got: number[] = [];
    toggle.onChange((r) => got.push(r));
    toggle.render(2);
    const [b1, b2] = el.querySelectorAll('button');
    expect([b1.textContent, b2.textContent]).toEqual(['1º turno', '2º turno']);
    expect([b1.getAttribute('aria-pressed'), b2.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    b2.click();
    b1.click();
    expect(got).toEqual([1]);
    toggle.render(1);
    expect(b1.getAttribute('aria-pressed')).toBe('true');
    el.querySelector<HTMLElement>('.round-toggle')!.click(); // clicks outside a button do nothing
    expect(got).toEqual([1]);
  });
});

describe('describeScope with first-round data', () => {
  const data = {
    summary: r1, stateNames: { BA: 'Bahia', PR: 'Paraná', SC: 'Santa Catarina' }, abroadCities: [],
    municipalities: {}, municipalityNames: {}, municipalityCount: 0, abroadResults: {}, sum: sumMulti,
  };
  it('a region sums its states vote by vote', () => {
    const s = describeScope({ country: 'BR', region: 'S', uf: null, city: null }, data);
    expect(s.result?.votes).toEqual([130, 50]);
  });
  it('the other levels read the first-round tables', () => {
    expect(describeScope({ country: 'ALL', region: 'ALL', uf: null, city: null }, data).result).toBe(r1.br);
    expect(describeScope({ country: 392, region: 'ALL', uf: null, city: null }, data).result).toBe(r1.countries['392']);
  });
});

describe('round1Fills', () => {
  it('paints each area with its winner color, shaded by the share', () => {
    const fills = round1Fills({ a: m([10, 90]), b: m([5, 5]), c: m([60, 40]) }, cands);
    expect(fills.a).toEqual({ fill: '#d7262d', el: 1000 });
    expect(fills.b).toEqual({ fill: null, el: 1000 });
    expect(fills.c.fill).not.toBe('#1f5fe0');
    expect(fills.c.fill).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('CandidateList', () => {
  const rows = ranking(r1.br, cands);
  it('lists the top five sorted by votes with photo, number, party, votes, share and color', () => {
    const el = document.createElement('div');
    new CandidateList(el).render(rows);
    const items = el.querySelectorAll<HTMLElement>('.c1');
    expect(items).toHaveLength(7);
    expect([...items].filter((i) => !i.hidden)).toHaveLength(5);
    const first = items[0];
    expect(first.dataset.cand).toBe('22');
    expect(first.querySelector('.nm')?.textContent).toBe('Flávio Bolsonaro');
    expect(first.querySelector('.pt')?.textContent).toContain('22 · PL');
    expect(first.querySelector('.runoff')?.textContent).toBe('2º TURNO');
    expect(items[2].querySelector('.runoff')).toBeNull();
    expect(first.querySelector('.pc')?.textContent).toBe('47,00%');
    expect(first.querySelector('.vt')?.textContent).toBe('47 votos');
    expect(first.querySelector('img')?.getAttribute('src')).toBe('https://resultados.tse.jus.br/oficial/ele2026/6257/fotos/br/100.jpeg');
    expect(first.style.getPropertyValue('--c')).toBe('#1f5fe0');
    expect(first.querySelector<HTMLElement>('.bar i')?.style.transform).toBe('scaleX(0.47)');
  });
  it('shows everyone and back with the toggle, and keeps the choice across renders', () => {
    const el = document.createElement('div');
    const list = new CandidateList(el);
    list.render(rows);
    const more = el.querySelector<HTMLButtonElement>('.more')!;
    expect(more.textContent).toBe('Ver todos os 7 candidatos');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click();
    expect([...el.querySelectorAll<HTMLElement>('.c1')].every((i) => !i.hidden)).toBe(true);
    expect(more.textContent).toBe('Ver menos');
    list.render(rows);
    expect([...el.querySelectorAll<HTMLElement>('.c1')].every((i) => !i.hidden)).toBe(true);
    more.click();
    expect(el.querySelectorAll<HTMLElement>('.c1:not([hidden])')).toHaveLength(5);
  });
  it('hides the toggle when everyone fits and shows dashes without data', () => {
    const el = document.createElement('div');
    new CandidateList(el).render(ranking(undefined, cands.slice(0, 3)));
    expect(el.querySelector<HTMLButtonElement>('.more')!.hidden).toBe(true);
    expect(el.querySelector('.pc')?.textContent).toBe('–');
    expect(el.querySelector('.vt')?.textContent).toBe('');
    expect(el.querySelector<HTMLElement>('.bar i')?.style.transform).toBe('scaleX(0)');
  });
  it('escapes names', () => {
    const el = document.createElement('div');
    new CandidateList(el).render(ranking(undefined, [{ ...cands[0], name: '<b>x</b>' }]));
    expect(el.querySelector('.nm b')).toBeNull();
    expect(el.querySelector('.nm')?.textContent).toBe('<b>x</b>');
  });
});

describe('Round1Card', () => {
  const scope = { crumb: 'Brasil › Nordeste', title: 'Bahia', sub: '417 municípios', result: r1.ufs.ba };
  it('shows the area, the ranking, the totals and the final status', () => {
    const el = document.createElement('div');
    new Round1Card(el).render(scope, cands);
    expect(el.querySelector('.scope')?.textContent).toBe('Bahia');
    expect(el.querySelector('.crumb')?.textContent).toBe('Brasil › Nordeste');
    expect(el.querySelector('.scope-sub')?.textContent).toBe('417 municípios');
    expect(el.querySelector('.c1')?.getAttribute('data-cand')).toBe('13');
    expect(el.textContent).toContain('Votos válidos');
    expect(el.textContent).toContain('Eleitorado');
    expect(el.querySelector('.updated')?.textContent).toBe('Resultado final · 100% das seções');
    expect(el.querySelector<HTMLElement>('.status')!.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>('.prog i')!.style.transform).toBe('scaleX(1)');
  });
  it('says when there is no data for the area', () => {
    const el = document.createElement('div');
    new Round1Card(el).render({ ...scope, result: undefined }, cands);
    expect(el.querySelector<HTMLElement>('.status')!.hidden).toBe(false);
    expect(el.textContent).toContain('Sem dados');
    expect(el.querySelector('.updated')?.textContent).toBe('');
    expect(el.querySelector<HTMLElement>('.prog i')!.style.transform).toBe('scaleX(0)');
  });
  it('shows partial counts with decimals', () => {
    const el = document.createElement('div');
    new Round1Card(el).render({ ...scope, result: m([1, 2], { st: 1, ts: 3 }) }, cands);
    expect(el.querySelector('.updated')?.textContent).toBe('Resultado final · 33,33% das seções');
  });
});

describe('Tooltip with first-round results', () => {
  it('shows the top three in their colors', () => {
    const el = document.createElement('div');
    new Tooltip(el).showRanking(10, 10, 'Bahia', ranking(r1.ufs.ba, cands));
    const rows = el.querySelectorAll<HTMLElement>('.r');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toBe('Lula70,0%');
    expect(rows[0].querySelector('span')!.style.color).toBe('rgb(215, 38, 45)');
    expect(el.classList.contains('on')).toBe(true);
  });
  it('says when there is no data', () => {
    const el = document.createElement('div');
    new Tooltip(el).showRanking(10, 10, 'X', ranking(undefined, cands));
    expect(el.textContent).toContain('Sem dados');
  });
});

describe('resultRows', () => {
  it('leaves out percentages when there is no turnout', () => {
    const html = resultRows(m([], { comp: 0, abst: 0 }));
    expect(html).not.toContain('<em>');
    expect(resultRows(undefined)).toBe('');
  });
});

describe('Tooltip with second-round results', () => {
  it('still shows Lula × Flávio', () => {
    const el = document.createElement('div');
    const tip = new Tooltip(el);
    tip.show(1, 1, 'Bahia', { ...m([]), l: 6, f: 4 });
    expect(el.textContent).toContain('Lula60,0%');
    tip.show(1, 1, 'Bahia', { ...m([]), l: 0, f: 0, released: false });
    expect(el.textContent).toContain('Aguardando');
    tip.show(1, 1, 'Bahia', undefined);
    expect(el.textContent).toContain('Sem dados');
  });
});
