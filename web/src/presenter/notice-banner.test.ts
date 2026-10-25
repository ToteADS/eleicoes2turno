import type { AreaResult, Notice, Summary } from '../domain/types';
import { setLocale } from '../i18n';
import { bannerFor, NoticeBanner, STALE_AFTER_MS, TSE_NEWS_URL, tseFileTime } from './notice-banner';

const notice: Notice = { title: 'Apuração pausada', body: 'O TSE suspendeu.', linkUrl: 'https://www.tse.jus.br/x', linkLabel: 'Saiba mais', updatedAt: '' };
const br = (over: Partial<AreaResult> = {}): AreaResult => ({ el: 1, comp: 1, abst: 0, vv: 1, vb: 0, vn: 0, st: 1, ts: 1, l: 1, f: 0, dg: '25/10/2026', hg: '17:06:31', released: true, ...over });
const summary = (over: Partial<AreaResult> = {}): Summary => ({ updatedAt: '', stale: false, candidates: [], br: br(over), brUfsSum: br(), zz: br(), ufs: {}, countries: {} });
// 17:06:31 in Brasília is 20:06:31 UTC
const FILE = Date.UTC(2026, 9, 25, 20, 6, 31);

describe('tseFileTime', () => {
  it('reads the Brasília stamp as UTC-3', () => {
    expect(tseFileTime('25/10/2026', '17:06:31')).toBe(FILE);
    expect(tseFileTime('25/10/2026', '22:30:00')).toBe(Date.UTC(2026, 9, 26, 1, 30, 0));
  });
  it('rejects malformed stamps', () => {
    expect(tseFileTime('', '')).toBeNull();
    expect(tseFileTime('2026-10-25', '17:06:31')).toBeNull();
    expect(tseFileTime('25/10/2026', '17:06')).toBeNull();
    expect(tseFileTime(undefined as unknown as string, '17:06:31')).toBeNull();
  });
});

describe('bannerFor', () => {
  beforeEach(() => setLocale('pt'));

  it('prefers the server notice, even when the TSE file is old', () => {
    expect(bannerFor(notice, summary(), FILE + 60 * 60_000)).toEqual({ kind: 'server', title: notice.title, body: notice.body, linkUrl: notice.linkUrl, linkLabel: 'Saiba mais' });
  });

  it('shows nothing while the TSE file is fresh', () => {
    expect(bannerFor(null, summary(), FILE)).toBeNull();
    expect(bannerFor(null, summary(), FILE + STALE_AFTER_MS)).toBeNull();
  });

  it('warns when the released TSE file is over 10 min old', () => {
    expect(bannerFor(null, summary(), FILE + 12 * 60_000 + 59_000)).toEqual({
      kind: 'auto',
      title: 'O TSE não atualiza os resultados há 12 min',
      body: 'Os números abaixo podem estar desatualizados. Acompanhe as notícias oficiais.',
      linkUrl: TSE_NEWS_URL,
      linkLabel: '',
    });
  });

  it('stays quiet before the release, without data or with a bad stamp', () => {
    const later = FILE + 60 * 60_000;
    expect(bannerFor(null, null, later)).toBeNull();
    expect(bannerFor(null, summary({ released: false }), later)).toBeNull();
    expect(bannerFor(null, summary({ dg: '', hg: '' }), later)).toBeNull();
  });

  it('translates the automatic warning', () => {
    setLocale('en');
    expect(bannerFor(null, summary(), FILE + 15 * 60_000)?.title).toBe('The TSE has not updated the results for 15 min');
    setLocale('es');
    expect(bannerFor(null, summary(), FILE + 15 * 60_000)?.title).toBe('El TSE no actualiza los resultados hace 15 min');
    setLocale('pt');
  });
});

describe('NoticeBanner', () => {
  let host: HTMLElement;
  beforeEach(() => {
    setLocale('pt');
    host = document.createElement('header');
    host.innerHTML = '<div class="topbar-head"></div>';
  });
  const el = () => host.querySelector<HTMLElement>('.notice')!;
  const link = () => host.querySelector<HTMLAnchorElement>('.notice-link')!;

  it('sits first in the host and starts hidden', () => {
    new NoticeBanner(host);
    expect(host.firstElementChild).toBe(el());
    expect(el().hidden).toBe(true);
    expect(el().getAttribute('role')).toBe('status');
  });

  it('renders the notice with a new-tab link', () => {
    new NoticeBanner(host).render({ kind: 'server', ...notice });
    expect(el().hidden).toBe(false);
    expect(el().dataset.kind).toBe('server');
    expect(host.querySelector('.notice-title')!.textContent).toBe('Apuração pausada');
    expect(host.querySelector<HTMLElement>('.notice-body')!.textContent).toBe('O TSE suspendeu.');
    expect(link().hidden).toBe(false);
    expect(link().href).toBe('https://www.tse.jus.br/x');
    expect(link().target).toBe('_blank');
    expect(link().rel).toBe('noopener');
    expect(link().textContent).toContain('Saiba mais');
    expect(link().textContent).toContain('→');
    expect(link().getAttribute('aria-label')).toBe('Saiba mais (abre em nova aba)');
  });

  it('never parses server text as HTML', () => {
    new NoticeBanner(host).render({ kind: 'server', title: '<img src=x onerror=alert(1)>', body: '<b>oi</b>', linkUrl: 'https://a.com', linkLabel: '<i>x</i>' });
    expect(host.querySelector('img, b, i')).toBeNull();
    expect(host.querySelector('.notice-title')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(link().textContent).toContain('<i>x</i>');
  });

  it('falls back to the translated label and hides empty parts', () => {
    const banner = new NoticeBanner(host);
    banner.render({ kind: 'auto', title: 'T', body: '', linkUrl: 'https://a.com', linkLabel: '' });
    expect(link().textContent).toContain('Saiba mais');
    expect(host.querySelector<HTMLElement>('.notice-body')!.hidden).toBe(true);
    banner.render({ kind: 'server', title: 'T', body: 'B', linkUrl: '', linkLabel: 'X' });
    expect(link().hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('.notice-body')!.hidden).toBe(false);
  });

  it('hides on null and leaves the DOM alone when nothing changed', () => {
    const banner = new NoticeBanner(host);
    banner.render({ kind: 'server', ...notice });
    const title = host.querySelector('.notice-title')!;
    const node = title.firstChild;
    banner.render({ kind: 'server', ...notice });
    expect(title.firstChild).toBe(node);
    banner.render(null);
    expect(el().hidden).toBe(true);
    banner.render(null);
    expect(el().hidden).toBe(true);
  });
});
