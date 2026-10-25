import { formatInt, formatPct } from '../domain/format';
import type { RankRow } from '../domain/multi';
import { candidateColor } from '../domain/palette';
import { t } from '../i18n';

const PHOTO_BASE = 'https://resultados.tse.jus.br/oficial/ele2026/6257/fotos/br/';
const VISIBLE = 5;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** First-round candidates sorted by votes: top five, the rest behind "ver todos". */
export class CandidateList {
  private expanded = false;
  private list: HTMLOListElement;
  private more: HTMLButtonElement;
  private count = 0;

  constructor(el: HTMLElement) {
    el.innerHTML = `<ol class="c1-list"></ol><button type="button" class="more" aria-expanded="false"></button>`;
    this.list = el.querySelector('ol')!;
    this.more = el.querySelector('.more')!;
    this.more.addEventListener('click', () => {
      this.expanded = !this.expanded;
      this.paintMore();
      this.list.dispatchEvent(new CustomEvent('resize-card', { bubbles: true }));
    });
  }

  render(rows: RankRow[]): void {
    this.count = rows.length;
    this.list.innerHTML = rows.map(({ candidate: c, votes, share }) => `
      <li class="c1" data-cand="${c.n}">
        <img alt="${esc(c.name)}" src="${PHOTO_BASE}${esc(c.sqcand)}.jpeg" width="40" height="50" loading="lazy" decoding="async">
        <div class="who">
          <div class="nm">${esc(c.name)}</div>
          <div class="pt">${c.n} · ${esc(c.party)}${c.runoff ? ` <span class="runoff">${t('r1_runoff')}</span>` : ''}</div>
          <div class="bar" aria-hidden="true"><i></i></div>
        </div>
        <div class="num"><div class="pc">${share === null ? '–' : formatPct(share)}</div><div class="vt">${share === null ? '' : `${formatInt(votes)} ${t('results_votes')}`}</div></div>
      </li>`).join('');
    // colors and bar widths through the CSSOM, not inline style attributes
    this.list.querySelectorAll<HTMLElement>('.c1').forEach((li, i) => {
      li.style.setProperty('--c', candidateColor(rows[i].candidate.n));
      li.querySelector<HTMLElement>('.bar i')!.style.transform = `scaleX(${rows[i].share ?? 0})`;
    });
    this.paintMore();
  }

  private paintMore(): void {
    this.list.querySelectorAll<HTMLElement>('.c1').forEach((li, i) => { li.hidden = !this.expanded && i >= VISIBLE; });
    this.more.hidden = this.count <= VISIBLE;
    this.more.textContent = this.expanded ? t('r1_show_less') : t('r1_show_all', { n: this.count });
    this.more.setAttribute('aria-expanded', String(this.expanded));
  }
}
