import type { Round } from '../domain/types';
import { t } from '../i18n';

/** Segmented control "1º turno | 2º turno" in the top bar. */
export class RoundToggle {
  private round: Round = 2;
  private listeners: ((r: Round) => void)[] = [];

  constructor(private readonly el: HTMLElement) {
    el.innerHTML = `
      <div class="round-toggle" role="group" aria-label="${t('round_label')}">
        <button type="button" data-round="1">${t('round_1')}</button><button type="button" data-round="2">${t('round_2')}</button>
      </div>`;
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-round]');
      if (!btn) return;
      const next = Number(btn.dataset.round) as Round;
      if (next !== this.round) this.listeners.forEach((cb) => cb(next));
    });
  }

  onChange(cb: (r: Round) => void): void {
    this.listeners.push(cb);
  }

  render(round: Round): void {
    this.round = round;
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button[data-round]')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.round) === round));
    }
  }
}
