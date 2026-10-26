import { DISPLAY_NAME, resolveWinner } from '../domain/elected';
import { formatInt, formatPct } from '../domain/format';
import { share } from '../domain/split';
import type { AreaResult, Candidate } from '../domain/types';
import { t } from '../i18n';
import { NumberTween } from './number-tween';
import { resultRowData, resultRowsHtml } from './result-rows';
import type { Scope } from './scope';

const PHOTO_BASE = 'https://resultados.tse.jus.br/oficial/ele2026/6258/fotos/br/';
const DEFAULT_CANDIDATES: Candidate[] = [
  { n: 13, name: 'LULA', party: 'PT', sqcand: '280002542548' },
  { n: 22, name: 'FLÁVIO BOLSONARO', party: 'PL', sqcand: '280002551544' },
];
const CHECK = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.2 11.6 2.6 8l1.2-1.2 2.4 2.4 6-6L13.4 4.4z"/></svg>';

const votes = (v: number) => `${formatInt(v)} ${t('results_votes')}`;

/**
 * Renders the floating results card. Builds its DOM once, then only updates text.
 * With `animate` (a data update of the same view) the numbers count to their new values
 * and the bars slide; otherwise everything is set at once.
 */
export class ResultsCard {
  private viewKey: string | null = null;
  private rowsKey = '';

  constructor(private readonly el: HTMLElement, private readonly numbers = new NumberTween()) {
    el.innerHTML = `
      <div class="scope-head">
        <div class="crumb" data-ref="crumb"></div>
        <div class="scope" data-ref="title"></div>
        <div class="scope-sub" data-ref="sub"></div>
      </div>
      <div class="prog" aria-hidden="true"><i data-ref="prog"></i></div>
      <p class="status" data-ref="status" hidden></p>
      ${[13, 22].map((n) => `
        <div class="cand ${n === 13 ? 'l' : 'f'}" data-cand="${n}">
          <img alt="" width="60" height="74" loading="lazy" decoding="async">
          <div class="who"><div class="nm">${DISPLAY_NAME[n]}</div>
            <div class="pt"><span data-ref="party"></span> <span class="lead" hidden>${t('results_leads')}</span><span class="won" hidden>${CHECK}${t('results_elected')}</span></div>
            <div class="vt"></div></div>
          <div class="pc">–</div>
        </div>`).join('')}
      <div class="split" aria-hidden="true"><i class="sl"></i><i class="sf"></i></div>
      <div class="rows" data-ref="rows"></div>
      <div class="updated" data-ref="updated-line"><span data-ref="updated"></span><span class="checked" data-ref="checked"></span></div>`;
  }

  /** Slot for the "verificado há X s" label, updated on its own every second. */
  get checkedSlot(): HTMLElement {
    return this.el.querySelector<HTMLElement>('[data-ref="checked"]')!;
  }

  /** `national` is the Brazil total: with the TSE's "md" flag it decides the mathematical winner in every view. */
  render(scope: Scope, candidates: Candidate[], stale: boolean, staleTime: string, animate = false, national: AreaResult | null = null): void {
    const $ = (ref: string) => this.el.querySelector<HTMLElement>(`[data-ref="${ref}"]`)!;
    const r = scope.result;
    // only a new value of the area already on screen animates
    const key = `${scope.crumb}\u0000${scope.title}`;
    const anim = animate && key === this.viewKey;
    this.viewKey = key;
    if (!anim) this.numbers.finishAll();
    this.el.classList.toggle('instant', !anim);
    $('crumb').textContent = scope.crumb;
    $('title').textContent = scope.title;

    const s = share(r);
    const sections = r && r.ts > 0 ? r.st / r.ts : 0;
    if (r?.released) this.numbers.set($('sub'), sections, (v) => `${scope.sub} · ${t('results_sections', { pct: formatPct(v) })}`, anim, false);
    else this.numbers.text($('sub'), scope.sub);
    $('prog').style.transform = `scaleX(${sections})`;

    const status = $('status');
    status.hidden = s !== null;
    status.textContent = !r ? t('status_no_data') : !r.released ? t('status_waiting') : '';

    const list = candidates.length ? candidates : DEFAULT_CANDIDATES;
    // national office: the winner (TSE flag, or the national leader once the TSE marks
    // the result as mathematically decided) holds in every view and replaces "LIDERA"
    const winner = resolveWinner(list, national)?.candidate ?? null;
    for (const n of [13, 22]) {
      const c = list.find((x) => x.n === n) ?? DEFAULT_CANDIDATES.find((x) => x.n === n)!;
      const row = this.el.querySelector<HTMLElement>(`[data-cand="${n}"]`)!;
      const img = row.querySelector('img')!;
      const src = PHOTO_BASE + c.sqcand + '.jpeg';
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.alt = DISPLAY_NAME[n];
      row.querySelector<HTMLElement>('[data-ref="party"]')!.textContent = `${n} · ${c.party}`;
      const mine = s === null ? null : n === 13 ? s : 1 - s;
      const pc = row.querySelector<HTMLElement>('.pc')!;
      if (mine === null) this.numbers.text(pc, '–');
      else this.numbers.set(pc, mine, (v) => formatPct(v), anim);
      const vt = row.querySelector<HTMLElement>('.vt')!;
      if (r?.released) this.numbers.set(vt, n === 13 ? r.l : r.f, votes, anim);
      else this.numbers.text(vt, '');
      row.querySelector('.lead')!.toggleAttribute('hidden', winner !== null || mine === null || mine <= 0.5);
      row.querySelector('.won')!.toggleAttribute('hidden', winner?.n !== n);
      row.classList.toggle('elected', winner?.n === n);
    }
    (this.el.querySelector('.sl') as HTMLElement).style.flexGrow = String(s ?? 0.5);
    (this.el.querySelector('.sf') as HTMLElement).style.flexGrow = String(s === null ? 0.5 : 1 - s);

    this.renderRows($('rows'), r, anim);

    $('updated').textContent = stale
      ? t('status_stale', { time: staleTime })
      : r?.released && r.hg ? t('status_updated', { time: r.hg.slice(0, 5) }) : '';
    $('updated-line').classList.toggle('warn', stale);
  }

  /** Same lines as before: count each value in place. Different lines: rebuild them. */
  private renderRows(el: HTMLElement, r: Scope['result'], anim: boolean): void {
    const rows = resultRowData(r);
    const key = rows.map((x) => `${x.label}${x.pct === undefined ? '' : '%'}`).join('|');
    if (key !== this.rowsKey) {
      this.rowsKey = key;
      el.innerHTML = resultRowsHtml(rows);
    }
    el.querySelectorAll<HTMLElement>('.row').forEach((line, i) => {
      this.numbers.set(line.querySelector('b')!, rows[i].value, formatInt, anim);
      const em = line.querySelector('em');
      if (em) this.numbers.set(em, rows[i].pct!, (v) => formatPct(v), anim);
    });
  }
}
