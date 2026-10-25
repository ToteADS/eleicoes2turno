import { formatPct } from '../domain/format';
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
    const w = 230;
    this.el.style.transform = `translate(${Math.min(x + 14, window.innerWidth - w)}px, ${y + 14}px)`;
    this.el.classList.add('on');
  }

  hide(): void {
    this.el.classList.remove('on');
  }
}
