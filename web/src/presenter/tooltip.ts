import { formatPct } from '../domain/format';
import type { RankRow } from '../domain/multi';
import { candidateColor } from '../domain/palette';
import { share } from '../domain/split';
import type { AreaResult } from '../domain/types';
import { t } from '../i18n';

/** Hover card that follows the pointer over the globe. */
export class Tooltip {
  constructor(private readonly el: HTMLElement) {}

  show(x: number, y: number, name: string, r: AreaResult | undefined): void {
    const s = share(r);
    this.el.replaceChildren();
    const title = document.createElement('b');
    title.textContent = name;
    this.el.append(title);
    if (s === null) {
      const p = document.createElement('div');
      p.className = 'muted';
      p.textContent = r && !r.released ? t('status_waiting') : t('status_no_data');
      this.el.append(p);
    } else {
      this.el.insertAdjacentHTML('beforeend',
        `<div class="r"><span class="cl">Lula</span><span>${formatPct(s, 1)}</span></div>` +
        `<div class="r"><span class="cf">Flávio</span><span>${formatPct(1 - s, 1)}</span></div>` +
        `<div class="r muted"><span>${t('results_sections', { pct: formatPct(r!.ts ? r!.st / r!.ts : 0, 0) })}</span></div>`);
    }
    this.place(x, y);
  }

  /** First round: the top three of the area in their colors. */
  showRanking(x: number, y: number, name: string, rows: RankRow[]): void {
    this.el.replaceChildren();
    const title = document.createElement('b');
    title.textContent = name;
    this.el.append(title);
    const top = rows.filter((r) => r.share !== null).slice(0, 3);
    if (!top.length) {
      const p = document.createElement('div');
      p.className = 'muted';
      p.textContent = t('status_no_data');
      this.el.append(p);
    }
    for (const r of top) {
      const line = document.createElement('div');
      line.className = 'r';
      const who = document.createElement('span');
      who.textContent = r.candidate.name;
      who.style.color = candidateColor(r.candidate.n);
      const pct = document.createElement('span');
      pct.textContent = formatPct(r.share!, 1);
      line.append(who, pct);
      this.el.append(line);
    }
    this.place(x, y);
  }

  private place(x: number, y: number): void {
    const w = 230;
    this.el.style.transform = `translate(${Math.min(x + 14, window.innerWidth - w)}px, ${y + 14}px)`;
    this.el.classList.add('on');
  }

  hide(): void {
    this.el.classList.remove('on');
  }
}
