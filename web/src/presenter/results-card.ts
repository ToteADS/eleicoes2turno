import { formatInt, formatPct } from '../domain/format';
import { share } from '../domain/split';
import type { Candidate } from '../domain/types';
import { t } from '../i18n';
import type { Scope } from './scope';

const PHOTO_BASE = 'https://resultados.tse.jus.br/oficial/ele2026/6258/fotos/br/';
const DEFAULT_CANDIDATES: Candidate[] = [
  { n: 13, name: 'LULA', party: 'PT', sqcand: '280002542548' },
  { n: 22, name: 'FLÁVIO BOLSONARO', party: 'PL', sqcand: '280002551544' },
];
const DISPLAY_NAME: Record<number, string> = { 13: 'Lula', 22: 'Flávio Bolsonaro' };

/** Renders the floating results card. Builds its DOM once, then only updates text. */
export class ResultsCard {
  constructor(private readonly el: HTMLElement) {
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
            <div class="pt"><span data-ref="party"></span> <span class="lead" hidden>${t('results_leads')}</span></div>
            <div class="vt"></div></div>
          <div class="pc">–</div>
        </div>`).join('')}
      <div class="split" aria-hidden="true"><i class="sl"></i><i class="sf"></i></div>
      <div class="rows" data-ref="rows"></div>
      <div class="updated" data-ref="updated"></div>`;
  }

  render(scope: Scope, candidates: Candidate[], stale: boolean, staleTime: string): void {
    const $ = (ref: string) => this.el.querySelector<HTMLElement>(`[data-ref="${ref}"]`)!;
    const r = scope.result;
    $('crumb').textContent = scope.crumb;
    $('title').textContent = scope.title;

    const s = share(r);
    const sections = r && r.ts > 0 ? r.st / r.ts : 0;
    $('sub').textContent = r?.released ? `${scope.sub} · ${t('results_sections', { pct: formatPct(sections) })}` : scope.sub;
    $('prog').style.transform = `scaleX(${sections})`;

    const status = $('status');
    status.hidden = s !== null;
    status.textContent = !r ? t('status_no_data') : !r.released ? t('status_waiting') : '';

    const list = candidates.length ? candidates : DEFAULT_CANDIDATES;
    for (const n of [13, 22]) {
      const c = list.find((x) => x.n === n) ?? DEFAULT_CANDIDATES.find((x) => x.n === n)!;
      const row = this.el.querySelector<HTMLElement>(`[data-cand="${n}"]`)!;
      const img = row.querySelector('img')!;
      const src = PHOTO_BASE + c.sqcand + '.jpeg';
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.alt = DISPLAY_NAME[n];
      row.querySelector<HTMLElement>('[data-ref="party"]')!.textContent = `${n} · ${c.party}`;
      const mine = s === null ? null : n === 13 ? s : 1 - s;
      row.querySelector('.pc')!.textContent = mine === null ? '–' : formatPct(mine);
      row.querySelector('.vt')!.textContent = r?.released ? `${formatInt(n === 13 ? r.l : r.f)} ${t('results_votes')}` : '';
      row.querySelector('.lead')!.toggleAttribute('hidden', mine === null || mine <= 0.5);
    }
    (this.el.querySelector('.sl') as HTMLElement).style.flexGrow = String(s ?? 0.5);
    (this.el.querySelector('.sf') as HTMLElement).style.flexGrow = String(s === null ? 0.5 : 1 - s);

    const row = (k: string, v: string, pct?: string) => `<div class="row"><span>${k}</span><span><b>${v}</b>${pct ? `<em>${pct}</em>` : ''}</span></div>`;
    $('rows').innerHTML = !r ? '' : [
      r.released ? row(t('results_valid'), formatInt(r.vv), r.comp ? formatPct(r.vv / r.comp) : undefined) : '',
      r.released ? row(t('results_blank'), formatInt(r.vb), r.comp ? formatPct(r.vb / r.comp) : undefined) : '',
      r.released ? row(t('results_null'), formatInt(r.vn), r.comp ? formatPct(r.vn / r.comp) : undefined) : '',
      r.released ? row(t('results_turnout'), formatInt(r.comp), r.comp + r.abst ? formatPct(r.comp / (r.comp + r.abst)) : undefined) : '',
      r.released ? row(t('results_abstention'), formatInt(r.abst), r.comp + r.abst ? formatPct(r.abst / (r.comp + r.abst)) : undefined) : '',
      row(t('results_electorate'), formatInt(r.el)),
    ].join('');

    $('updated').textContent = stale
      ? t('status_stale', { time: staleTime })
      : r?.released && r.hg ? t('status_updated', { time: r.hg.slice(0, 5) }) : '';
    $('updated').classList.toggle('warn', stale);
  }
}
