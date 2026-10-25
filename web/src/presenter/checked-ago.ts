import { t } from '../i18n';

export interface CheckedAgoOptions {
  tickMs?: number;
}

/** "verificado há 12 s" / "verificado há 2 min" for an age in milliseconds. */
export function checkedAgoText(ageMs: number): string {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  return s < 60 ? t('status_checked_s', { n: s }) : t('status_checked_min', { n: Math.floor(s / 60) });
}

/** Age of the last successful summary fetch, so the card looks alive even when the TSE file does not change. */
export class CheckedAgo {
  private readonly tickMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private at: number | null = null;

  constructor(private readonly el: HTMLElement, opts: CheckedAgoOptions = {}) {
    this.tickMs = opts.tickMs ?? 1_000;
  }

  /** Records a successful check (default: now). */
  mark(at = Date.now()): void {
    this.at = at;
    this.paint();
  }

  start(): void {
    if (this.timer === undefined) this.timer = setInterval(() => this.paint(), this.tickMs);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  // only this label is re-rendered each tick, and only when its text changed
  private paint(): void {
    const text = this.at === null ? '' : checkedAgoText(Date.now() - this.at);
    if (this.el.textContent !== text) this.el.textContent = text;
  }
}
