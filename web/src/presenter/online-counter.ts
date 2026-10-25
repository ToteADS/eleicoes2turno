import { PresenceDto } from '../domain/dtos/presence-dto';
import { formatInt } from '../domain/format';
import type { PresenceAnswer } from '../domain/types';
import { t } from '../i18n';

export interface PresenceApi {
  presence(dto: PresenceDto): Promise<PresenceAnswer>;
}

export interface OnlineCounterOptions {
  intervalMs?: number;
  /** consecutive failed heartbeats before the pill is hidden */
  maxFailures?: number;
}

/** "● 1.234 pessoas online agora": heartbeats while the tab is visible and shows the server's count. */
export class OnlineCounter {
  private readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private readonly intervalMs: number;
  private readonly maxFailures: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private failures = 0;
  private running = false;
  private readonly onVisibility = () => (document.hidden ? this.pause() : this.resume());

  constructor(host: HTMLElement, private readonly api: PresenceApi, private readonly id: string, opts: OnlineCounterOptions = {}) {
    this.intervalMs = opts.intervalMs ?? 60_000;
    this.maxFailures = opts.maxFailures ?? 2;
    this.el = document.createElement('p');
    this.el.className = 'online';
    this.el.hidden = true;
    this.el.innerHTML = '<span class="online-dot" aria-hidden="true"></span><span></span>';
    this.text = this.el.lastElementChild as HTMLElement;
    host.append(this.el);
  }

  start(): void {
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    if (!document.hidden) this.resume();
  }

  stop(): void {
    this.running = false;
    this.pause();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private resume(): void {
    this.pause();
    void this.beat();
    this.timer = setInterval(() => void this.beat(), this.intervalMs);
  }

  private pause(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async beat(): Promise<void> {
    let online: number;
    try {
      ({ online } = await this.api.presence(new PresenceDto(this.id)));
      if (!Number.isFinite(online)) throw new Error('bad presence answer');
    } catch {
      if (this.running && ++this.failures >= this.maxFailures) this.el.hidden = true;
      return;
    }
    if (!this.running) return;
    this.failures = 0;
    this.text.textContent = t(online === 1 ? 'online_count_one' : 'online_count', { n: formatInt(online) });
    this.el.hidden = false;
  }
}
