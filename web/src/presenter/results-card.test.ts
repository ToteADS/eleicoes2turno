import type { AreaResult, Candidate } from '../domain/types';
import { setLocale } from '../i18n';
import { ManualClock } from '../testing/manual-clock';
import { NumberTween } from './number-tween';
import { resultRows } from './result-rows';
import { ResultsCard } from './results-card';
import type { Scope } from './scope';

const r = (l: number, f: number, extra: Partial<AreaResult> = {}): AreaResult => ({
  el: 1000, comp: 800, abst: 200, vv: l + f, vb: 10, vn: 20, l, f, st: 5, ts: 10, dg: '25/10/2026', hg: '17:30:00', released: true, ...extra,
});
const candidates: Candidate[] = [];
const brasil = (result: AreaResult | undefined): Scope => ({ crumb: '', title: 'Brasil', sub: 'Total oficial', result });

function card() {
  const clock = new ManualClock();
  const el = document.createElement('div');
  const c = new ResultsCard(el, new NumberTween(clock));
  const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
  return { clock, el, c, q };
}

beforeEach(() => setLocale('pt'));

describe('ResultsCard live updates', () => {
  it('first render is instant, with transitions off', () => {
    const { clock, el, c, q } = card();
    c.render(brasil(r(600, 400)), candidates, false, '', true);
    expect(clock.pending).toBe(0);
    expect(q('[data-cand="13"] .pc').textContent).toBe('60,00%');
    expect(el.classList.contains('instant')).toBe(true);
    expect(el.querySelector('.bump')).toBeNull();
  });

  it('a data update of the same view counts every number and lands on the exact values', () => {
    const { clock, el, c, q } = card();
    c.render(brasil(r(600, 400)), candidates, false, '');
    c.render(brasil(r(700, 500, { st: 8, vb: 30, comp: 1250, abst: 150 })), candidates, false, '', true);
    expect(el.classList.contains('instant')).toBe(false);
    expect(q('[data-cand="13"] .vt').classList.contains('bump')).toBe(true);
    clock.step(400);
    const mid = Number(q('[data-cand="13"] .vt').textContent!.split(' ')[0]);
    expect(mid).toBeGreaterThan(600);
    expect(mid).toBeLessThan(700);
    expect(q('[data-ref="sub"]').textContent).toMatch(/^Total oficial · \d{2},\d{2}% das seções totalizadas$/);
    clock.run(100);
    expect(q('[data-cand="13"] .pc').textContent).toBe('58,33%');
    expect(q('[data-cand="22"] .pc').textContent).toBe('41,67%');
    expect(q('[data-cand="13"] .vt').textContent).toBe('700 votos');
    expect(q('[data-ref="sub"]').textContent).toBe('Total oficial · 80,00% das seções totalizadas');
    // the totals end exactly as a fresh render would draw them
    expect(q('[data-ref="rows"]').innerHTML.replace(/ class="bump"/g, '')).toBe(resultRows(r(700, 500, { st: 8, vb: 30, comp: 1250, abst: 150 })));
    expect(q('[data-ref="prog"]').style.transform).toBe('scaleX(0.8)');
    expect(q('.sl').style.flexGrow).toBe(String(700 / 1200));
  });

  it('values that did not change do not pulse', () => {
    const { c, q } = card();
    c.render(brasil(r(600, 400)), candidates, false, '');
    c.render(brasil(r(600, 400, { vb: 11 })), candidates, false, '', true);
    expect(q('[data-cand="13"] .vt').classList.contains('bump')).toBe(false);
    expect(q('[data-ref="rows"] .row:nth-child(2) b').classList.contains('bump')).toBe(true);
  });

  it('switching the area renders instantly even when asked to animate', () => {
    const { clock, el, c, q } = card();
    c.render(brasil(r(600, 400)), candidates, false, '');
    c.render({ crumb: 'Brasil', title: 'Bahia', sub: 'Estado', result: r(100, 300) }, candidates, false, '', true);
    expect(clock.pending).toBe(0);
    expect(el.classList.contains('instant')).toBe(true);
    expect(q('[data-cand="13"] .pc').textContent).toBe('25,00%');
  });

  it('a render without animate mid-tween lands at once on the new numbers', () => {
    const { clock, c, q } = card();
    c.render(brasil(r(600, 400)), candidates, false, '');
    c.render(brasil(r(700, 300)), candidates, false, '', true);
    clock.step(100);
    c.render(brasil(r(500, 500)), candidates, false, '');
    expect(q('[data-cand="13"] .pc').textContent).toBe('50,00%');
    expect(clock.pending).toBe(0);
  });

  it('rows that appear or go away are rebuilt, not tweened', () => {
    const { c, q } = card();
    c.render(brasil(r(0, 0, { released: false })), candidates, false, '');
    expect(q('[data-ref="rows"]').querySelectorAll('.row').length).toBe(1);
    c.render(brasil(r(600, 400)), candidates, false, '', true);
    expect(q('[data-ref="rows"]').querySelectorAll('.row').length).toBe(6);
    expect(q('[data-ref="rows"]').querySelector('.bump')).toBeNull();
    expect(q('[data-cand="13"] .pc').textContent).toBe('60,00%'); // from '–': no tween
  });

  it('losing the numbers shows the dash and the plain subtitle', () => {
    const { c, q } = card();
    c.render(brasil(r(600, 400)), candidates, false, '');
    c.render(brasil(undefined), candidates, false, '', true);
    expect(q('[data-cand="13"] .pc').textContent).toBe('–');
    expect(q('[data-cand="13"] .vt').textContent).toBe('');
    expect(q('[data-ref="sub"]').textContent).toBe('Total oficial');
  });

  it('keeps the checked-ago slot untouched', () => {
    const { c } = card();
    c.checkedSlot.textContent = 'verificado há 3 s';
    c.render(brasil(r(600, 400)), candidates, false, '');
    c.render(brasil(r(610, 400)), candidates, false, '', true);
    expect(c.checkedSlot.textContent).toBe('verificado há 3 s');
  });
});

describe('ResultsCard elected badge', () => {
  const tse = (lulaElected: boolean, flavioElected = false): Candidate[] => [
    { n: 13, name: 'LULA', party: 'PT', sqcand: '1', elected: lulaElected, status: lulaElected ? 'Eleito' : '' },
    { n: 22, name: 'FLAVIO BOLSONARO', party: 'PL', sqcand: '2', elected: flavioElected, status: flavioElected ? 'Eleito' : '' },
  ];
  const visible = (q: (s: string) => HTMLElement, sel: string) => !q(sel).hasAttribute('hidden');

  it('shows LIDERA for the leader while nobody is elected', () => {
    const { c, q } = card();
    c.render(brasil(r(600, 400)), tse(false), false, '');
    expect(visible(q, '[data-cand="13"] .lead')).toBe(true);
    expect(visible(q, '[data-cand="13"] .won')).toBe(false);
    expect(visible(q, '[data-cand="22"] .won')).toBe(false);
  });

  it('shows ELEITO from the TSE flag and drops every LIDERA', () => {
    const { c, q } = card();
    c.render(brasil(r(600, 400)), tse(true), false, '');
    expect(visible(q, '[data-cand="13"] .won')).toBe(true);
    expect(q('[data-cand="13"] .won').textContent).toBe('ELEITO');
    expect(q('[data-cand="13"]').classList.contains('elected')).toBe(true);
    expect(visible(q, '[data-cand="13"] .lead')).toBe(false);
    expect(visible(q, '[data-cand="22"] .won')).toBe(false);
    expect(visible(q, '[data-cand="22"] .lead')).toBe(false);
  });

  it('keeps the badge in a state where the winner trails', () => {
    const { c, q } = card();
    c.render({ crumb: 'Brasil', title: 'Santa Catarina', sub: '', result: r(300, 700) }, tse(true), false, '');
    expect(visible(q, '[data-cand="13"] .won')).toBe(true);
    expect(visible(q, '[data-cand="22"] .lead')).toBe(false);
  });

  it('clears the badge if the flag goes away', () => {
    const { c, q } = card();
    c.render(brasil(r(600, 400)), tse(false, true), false, '');
    expect(visible(q, '[data-cand="22"] .won')).toBe(true);
    c.render(brasil(r(600, 400)), tse(false), false, '');
    expect(visible(q, '[data-cand="22"] .won')).toBe(false);
    expect(q('[data-cand="22"]').classList.contains('elected')).toBe(false);
    expect(visible(q, '[data-cand="13"] .lead')).toBe(true);
  });

  it('translates the badge', () => {
    setLocale('en');
    expect(card().q('[data-cand="13"] .won').textContent).toBe('ELECTED');
    setLocale('es');
    expect(card().q('[data-cand="13"] .won').textContent).toBe('ELECTO');
    setLocale('pt');
  });
});
