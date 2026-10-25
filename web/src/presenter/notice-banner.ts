import type { Notice, Summary } from '../domain/types';
import { t } from '../i18n';

/** TSE file older than this while results are out: assume the count is stuck. */
export const STALE_AFTER_MS = 10 * 60_000;
export const TSE_NEWS_URL = 'https://www.tse.jus.br/comunicacao/noticias';

export interface BannerContent {
  /** server: published by the operator; auto: the TSE file stopped changing */
  kind: 'server' | 'auto';
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
 * What the banner shows: the server notice when there is one; otherwise, once
 * the TSE has released results, a warning if its file is over 10 min old.
 */
export function bannerFor(notice: Notice | null, summary: Summary | null, now = Date.now()): BannerContent | null {
  if (notice) return { kind: 'server', title: notice.title, body: notice.body, linkUrl: notice.linkUrl, linkLabel: notice.linkLabel };
  const br = summary?.br;
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

const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.5 1.5 21h21L12 2.5Zm0 5.2 6.9 11.8H5.1L12 7.7Zm-1 3.8v4h2v-4h-2Zm0 5.2v2h2v-2h-2Z"/></svg>';

/** Amber banner at the top of the filters card. Server text only ever goes through textContent. */
export class NoticeBanner {
  private readonly el: HTMLElement;
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
    this.el.innerHTML = `<span class="notice-icon">${ICON}</span>
      <div class="notice-text"><strong class="notice-title"></strong><p class="notice-body"></p></div>
      <a class="notice-link" target="_blank" rel="noopener"><span></span> <span aria-hidden="true">→</span></a>`;
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
