import { displayName, resolveWinner } from '../domain/elected';
import { formatPct } from '../domain/format';
import type { Notice, Summary } from '../domain/types';
import { t } from '../i18n';

/** TSE file older than this while results are out: assume the count is stuck. */
export const STALE_AFTER_MS = 10 * 60_000;
export const TSE_NEWS_URL = 'https://www.tse.jus.br/comunicacao/noticias';
export const TSE_RESULTS_URL = 'https://resultados.tse.jus.br/oficial/app/index.html';

export interface BannerContent {
  /** server: published by the operator; elected: the TSE declared the winner or marked the result as mathematically decided; auto: the TSE file stopped changing */
  kind: 'server' | 'elected' | 'auto';
  title: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
}

/** Epoch ms of a TSE file stamp ("25/10/2026" + "17:06:31", Brasília time, UTC-3), or null. */
export function tseFileTime(dg: string, hg: string): number | null {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dg ?? '');
  const h = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hg ?? '');
  if (!d || !h) return null;
  return Date.UTC(+d[3], +d[2] - 1, +d[1], +h[1] + 3, +h[2], +h[3]);
}

/**
 * What the banner shows: the server notice when there is one; otherwise the
 * winner once the TSE flags a candidate as elected (or marks the result as
 * mathematically decided, "md": "e"); otherwise, once the TSE has
 * released results, a warning if its file is over 10 min old.
 */
export function bannerFor(notice: Notice | null, summary: Summary | null, now = Date.now()): BannerContent | null {
  if (notice) return { kind: 'server', title: notice.title, body: notice.body, linkUrl: notice.linkUrl, linkLabel: notice.linkLabel };
  const br = summary?.br;
  const winner = resolveWinner(summary?.candidates, br);
  if (winner) {
    const counted = br && br.ts > 0 ? Math.min(br.st, br.ts) / br.ts : 1;
    const math = winner.kind === 'mathematical';
    return {
      kind: 'elected',
      title: t(math ? 'elected_math_title' : 'elected_title', { name: displayName(winner.candidate) }),
      body: t(math ? 'elected_math_body' : 'elected_body', { pct: formatPct(counted) }),
      linkUrl: TSE_RESULTS_URL,
      linkLabel: t('elected_link'),
    };
  }
  if (!br?.released) return null;
  const at = tseFileTime(br.dg, br.hg);
  if (at === null || now - at <= STALE_AFTER_MS) return null;
  return {
    kind: 'auto',
    title: t('notice_stale_title', { n: Math.floor((now - at) / 60_000) }),
    body: t('notice_stale_body'),
    linkUrl: TSE_NEWS_URL,
    linkLabel: '',
  };
}

const ICON_WARN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.5 1.5 21h21L12 2.5Zm0 5.2 6.9 11.8H5.1L12 7.7Zm-1 3.8v4h2v-4h-2Zm0 5.2v2h2v-2h-2Z"/></svg>';

const ICON_CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm-1.4 14.9-4.2-4.2 1.4-1.4 2.8 2.8 5.8-5.8 1.4 1.4-7.2 7.2Z"/></svg>';

/** Amber banner (green once a winner is declared) at the top of the filters card. Server text only ever goes through textContent. */
export class NoticeBanner {
  private readonly el: HTMLElement;
  private readonly icon: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly link: HTMLAnchorElement;
  private readonly label: HTMLElement;
  private shown = '';

  constructor(host: HTMLElement) {
    this.el = document.createElement('section');
    this.el.className = 'notice';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    this.el.innerHTML = `<span class="notice-icon">${ICON_WARN}</span>
      <div class="notice-text"><strong class="notice-title"></strong><p class="notice-body"></p></div>
      <a class="notice-link" target="_blank" rel="noopener"><span></span> <span aria-hidden="true">→</span></a>`;
    this.icon = this.el.querySelector('.notice-icon')!;
    this.title = this.el.querySelector('.notice-title')!;
    this.body = this.el.querySelector('.notice-body')!;
    this.link = this.el.querySelector('.notice-link')!;
    this.label = this.link.firstElementChild as HTMLElement;
    host.prepend(this.el);
  }

  render(content: BannerContent | null): void {
    const key = content ? JSON.stringify(content) : '';
    if (key === this.shown) return; // polls re-render every 30 s; leave the DOM alone when nothing changed
    this.shown = key;
    this.el.hidden = !content;
    if (!content) return;
    this.el.dataset.kind = content.kind;
    this.icon.innerHTML = content.kind === 'elected' ? ICON_CHECK : ICON_WARN;
    this.title.textContent = content.title;
    this.body.textContent = content.body;
    this.body.hidden = !content.body;
    this.link.hidden = !content.linkUrl;
    if (content.linkUrl) {
      const label = content.linkLabel || t('notice_more');
      this.link.href = content.linkUrl;
      this.label.textContent = label;
      this.link.setAttribute('aria-label', `${label} (${t('notice_new_tab')})`);
    }
  }
}
