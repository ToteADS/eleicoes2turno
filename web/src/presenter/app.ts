import { initialFilters, setCity, setCountry, setUf, type FilterState } from '../domain/filters';
import type { PresenceDto } from '../domain/dtos/presence-dto';
import { ranking, sumMulti } from '../domain/multi';
import type { AbroadCity, AreaListResponse, AreaResult, MultiResult, Notice, PresenceAnswer, PublicConfig, Round, Round1Summary, Summary } from '../domain/types';
import { prefersReducedMotion } from '../infra/animation';
import { latest } from '../infra/api';
import { tabId } from '../infra/tab-id';
import type { AreaCollection, GlobePick, GlobeRenderer, GlobeView } from '../infra/globe';
import { t } from '../i18n';
import { AdSlot } from './ad-slot';
import { CheckedAgo } from './checked-ago';
import { CreatorCredit } from './creator-credit';
import { FiltersCard } from './filters-card';
import { GlobeControls } from './globe-controls';
import { bannerFor, NoticeBanner } from './notice-banner';
import { ResultsCard } from './results-card';
import { NullGlobe } from './null-globe';
import { OnlineCounter } from './online-counter';
import { Round1Card } from './round1-card';
import { round1Fills } from './round1-paint';
import { RoundToggle } from './round-toggle';
import { readRound, roundUrl } from './round-url';
import { describeScope } from './scope';
import { isStale } from './staleness';
import { Tooltip } from './tooltip';

export interface AppDeps {
  root: HTMLElement;
  globe: GlobeRenderer;
  api: {
    summary(): Promise<Summary>;
    municipalities(uf: string): Promise<AreaListResponse>;
    abroadCities(): Promise<AreaListResponse>;
    config(): Promise<PublicConfig>;
    presence(dto: PresenceDto): Promise<PresenceAnswer>;
    notice(): Promise<Notice | null>;
  };
  geo: {
    states(): Promise<AreaCollection>;
    world(): Promise<AreaCollection>;
    municipalities(uf: string): Promise<AreaCollection>;
    abroadCities(): Promise<AbroadCity[]>;
  };
  /** static snapshot of the final first round (never polled) */
  round1: {
    summary(): Promise<Round1Summary>;
    municipalities(uf: string): Promise<Record<string, MultiResult>>;
    abroadCities(): Promise<Record<string, MultiResult>>;
  };
  pollMs?: number;
  /** id of this tab for the online counter (default: random, kept per session) */
  tabId?: string;
}

const DEFAULT_CONFIG: PublicConfig = {
  ads: { adsenseClient: '', slotResults: '', slotMobile: '', house: { image: '/ads/tapp-banner-v2.svg', link: 'https://tapp.solutions', alt: 'Tapp Solutions' } },
};

/** Floating side card layout: desktop, and tablets in landscape. Otherwise bottom dock. */
const isWide = () => window.innerWidth >= 1024 || (window.innerWidth >= 640 && window.innerWidth > window.innerHeight);

export function viewFor(f: FilterState): GlobeView {
  if (f.country === 'ALL') return { kind: 'all' };
  if (f.country === 'BR') {
    if (f.uf && f.city) return { kind: 'municipality', uf: f.uf, id: f.city };
    if (f.uf) return { kind: 'uf', uf: f.uf };
    return { kind: 'brazil', region: f.region };
  }
  return f.city ? { kind: 'abroadCity', cd: f.city } : { kind: 'country', iso: f.country };
}

function shell(root: HTMLElement): void {
  root.innerHTML = `
    <div id="globe" class="globe" role="application" aria-label="${t('globe_hint')}"></div>
    <header class="card topbar" id="topbar"></header>
    <div class="dock" id="dock">
      <div class="ad ad-mobile"></div>
      <aside class="card results" id="results" aria-live="polite">
        <button type="button" class="sheet-handle" aria-expanded="false"><span></span><em>${t('results_expand')}</em></button>
        <div class="results-body results-r2"></div>
        <div class="results-body results-r1" hidden></div>
        <div class="ad ad-results"></div>
        <div class="credit"></div>
      </aside>
    </div>
    <nav class="controls" aria-label="Globo"></nav>
    <footer class="foot"><span>${t('globe_hint')}</span><span>${t('footer_source')} · Natural Earth · IBGE · <a href="https://github.com/ToteADS/eleicoes2turno" target="_blank" rel="noopener">${t('footer_code')}</a></span></footer>
    <div class="tip" role="tooltip"></div>
    <p class="globe-note" hidden>${t('status_globe_unavailable')}</p>`;
}

export async function createApp(d: AppDeps): Promise<{ dispose(): void }> {
  shell(d.root);
  const $ = <T extends HTMLElement>(sel: string) => d.root.querySelector<T>(sel)!;
  const filtersCard = new FiltersCard($('#topbar'));
  const resultsCard = new ResultsCard($('.results-r2'));
  const checked = new CheckedAgo(resultsCard.checkedSlot);
  const round1Card = new Round1Card($('.results-r1'));
  const roundToggle = new RoundToggle(filtersCard.roundSlot);
  const tooltip = new Tooltip($('.tip'));
  const noticeBanner = new NoticeBanner($('#topbar'));
  const online = new OnlineCounter($('#topbar'), d.api, d.tabId ?? tabId());
  online.start();

  let round: Round = readRound(window.location.search);
  let filters = initialFilters();
  let summary: Summary | null = null;
  // operator notice (second round only); a failed fetch keeps the last one known
  let notice: Notice | null = null;
  let municipalities: Record<string, AreaResult> = {};
  let muniGeo: AreaCollection | null = null;
  let abroadResults: Record<string, AreaResult> = {};
  // first round: loaded on demand from the static snapshot
  let r1: Round1Summary | null = null;
  let r1Munis: Record<string, MultiResult> = {};
  let r1Abroad: Record<string, MultiResult> = {};
  const loadRound1 = async () => {
    [r1, r1Abroad] = await Promise.all([d.round1.summary().catch(() => null), d.round1.abroadCities().catch(() => ({}))]);
  };

  const emptyAreas = (): AreaCollection => ({ type: 'FeatureCollection', features: [] });
  const [config, states, world, abroadCities] = await Promise.all([
    d.api.config().catch(() => DEFAULT_CONFIG),
    d.geo.states().catch(() => emptyAreas()),
    d.geo.world().catch(() => emptyAreas()),
    d.geo.abroadCities().catch(() => [] as AbroadCity[]),
  ]);
  let failedPolls = 0;
  const loadNotice = () => d.api.notice().then((n) => { notice = n; }, () => undefined);
  const loadRound2 = async () => {
    const noticeLoaded = loadNotice();
    summary = await d.api.summary().catch(() => { failedPolls++; return null; });
    if (summary) checked.mark();
    abroadResults = (await d.api.abroadCities().catch(() => null))?.items ?? {};
    await noticeLoaded;
  };
  await (round === 1 ? loadRound1() : loadRound2());

  const stateNames = Object.fromEntries(states.features.map((f) => [String(f.properties?.uf), String(f.properties?.name)]));
  const countries = [...new Map(abroadCities.map((c) => [c.iso, c.country])).entries()]
    .map(([iso, name]) => ({ iso, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const adSlots = [new AdSlot($('.ad-results'), 'results'), new AdSlot($('.ad-mobile'), 'mobile')];
  for (const slot of adSlots) slot.render(config);
  new CreatorCredit($('.credit')).render();

  let globe = d.globe;
  try {
    await globe.mount($('#globe'));
  } catch (err) {
    console.error('globe unavailable', err);
    globe = new NullGlobe();
    $('.globe-note').hidden = false;
  }
  // first round: each area whole in its winner's color; second round: the red × blue split
  const fills = (items: Record<string, MultiResult>) => (r1 ? round1Fills(items, r1.candidates) : {});
  // animate = a poll brought new numbers for the view on screen (never on load, filter or round changes)
  const paintMunicipalities = (animate = false) =>
    globe.setMunicipalities(filters.uf, muniGeo, round === 1 ? fills(r1Munis) : municipalities, { animate });
  const paintGlobe = (animate = false) => {
    const opts = { animate };
    globe.setStates(states, round === 1 ? fills(r1?.ufs ?? {}) : summary?.ufs ?? {}, opts);
    globe.setWorld(world, round === 1 ? fills(r1?.countries ?? {}) : summary?.countries ?? {}, opts);
    globe.setAbroadCities(abroadCities, round === 1 ? fills(r1Abroad) : abroadResults, opts);
    paintMunicipalities(animate);
  };
  // bumped by every filter or round change: a poll that started before one does not animate
  let viewEpoch = 0;

  const muniNames = () => Object.fromEntries((muniGeo?.features ?? []).map((f) => [String(f.properties?.id), String(f.properties?.name)]));
  const render = (animate = false) => {
    const names = muniNames();
    const cities = filters.country === 'BR'
      ? Object.entries(names).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      : typeof filters.country === 'number'
        ? abroadCities.filter((c) => c.iso === filters.country).map((c) => ({ id: c.cd, name: c.nm }))
        : [];
    filtersCard.render(filters, {
      countries,
      states: Object.entries(stateNames).map(([uf, name]) => ({ uf, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      cities,
    });
    const common = { stateNames, abroadCities, municipalityNames: names, municipalityCount: muniGeo?.features.length ?? 0 };
    roundToggle.render(round);
    filtersCard.setTitle(round === 1 ? t('app_title_r1') : t('app_title'));
    $('.results-r1').hidden = round !== 1;
    $('.results-r2').hidden = round !== 2;
    if (round === 1) {
      const scope = describeScope<MultiResult>(filters, { ...common, summary: r1, municipalities: r1Munis, abroadResults: r1Abroad, sum: sumMulti });
      round1Card.render(scope, r1?.candidates ?? []);
      noticeBanner.render(null); // the first round is a final snapshot
    } else {
      noticeBanner.render(bannerFor(notice, summary));
      const scope = describeScope(filters, { ...common, summary, municipalities, abroadResults });
      const staleTime = summary ? new Date(summary.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      resultsCard.render(scope, summary?.candidates ?? [], isStale(summary, failedPolls), staleTime, animate);
    }
    updatePadding();
  };

  const loadMunicipalities = async (uf: string | null): Promise<boolean> => {
    if (!uf) {
      muniGeo = null;
      municipalities = {};
      r1Munis = {};
      return true;
    }
    const forRound = round;
    const results = (): Promise<Record<string, AreaResult | MultiResult> | null> => forRound === 1
      ? d.round1.municipalities(uf).catch(() => null)
      : d.api.municipalities(uf).then((x) => x.items, () => null);
    const got = await latest('mun', () => Promise.all([d.geo.municipalities(uf), results()]).catch(() => null));
    if (got === undefined) return false; // a newer selection won
    // on failure clear the previous state's data rather than showing it under the new state
    muniGeo = got ? got[0] : null;
    if (forRound === 1) r1Munis = (got?.[1] ?? {}) as Record<string, MultiResult>;
    else municipalities = (got?.[1] ?? {}) as Record<string, AreaResult>;
    return true;
  };

  const apply = async (next: FilterState) => {
    const ufChanged = next.uf !== filters.uf;
    filters = next;
    viewEpoch++;
    render();
    if (ufChanged && !(await loadMunicipalities(next.uf))) return;
    if (next !== filters) return; // superseded while loading
    paintMunicipalities();
    globe.focus(viewFor(filters));
    filtersCard.close();
    render();
  };
  filtersCard.onChange((s) => void apply(s));

  // switching round keeps the filters and the camera; only the data and the colors change
  const switchRound = async (next: Round) => {
    round = next;
    viewEpoch++;
    window.history.replaceState(window.history.state, '', roundUrl(window.location.href, next));
    render();
    if (next === 1 && !r1) await loadRound1();
    if (next === 2) await loadRound2(); // live data may have moved on while round 1 was shown
    if (round !== next) return; // switched again meanwhile
    // a newer switch or state reloads the municipalities too, and wins (latest)
    if (filters.uf && !(await loadMunicipalities(filters.uf))) return;
    paintGlobe();
    render();
  };
  roundToggle.onChange((r) => void switchRound(r));

  globe.onPick((p: GlobePick) => {
    if (p.kind === 'uf') void apply(setUf(filters, p.uf));
    if (p.kind === 'municipality' && filters.uf) void apply(setCity(filters, p.id));
    if (p.kind === 'country') void apply(setCountry(filters, p.iso));
    if (p.kind === 'abroadCity') {
      const c = abroadCities.find((x) => x.cd === p.cd);
      if (c) void apply(setCity(setCountry(filters, c.iso), c.cd));
    }
  });
  const tip = (x: number, y: number, name: string, second: AreaResult | undefined, first: MultiResult | undefined) =>
    round === 1 ? tooltip.showRanking(x, y, name, ranking(first, r1?.candidates ?? [])) : tooltip.show(x, y, name, second);
  globe.onHover((h) => {
    if (!h) return tooltip.hide();
    if (h.kind === 'uf') tip(h.x, h.y, stateNames[h.uf] ?? h.uf, summary?.ufs[h.uf.toLowerCase()], r1?.ufs[h.uf.toLowerCase()]);
    if (h.kind === 'municipality') tip(h.x, h.y, muniNames()[h.id] ?? h.id, municipalities[h.id], r1Munis[h.id]);
    if (h.kind === 'country') {
      const iso = String(h.iso);
      tip(h.x, h.y, countries.find((c) => c.iso === h.iso)?.name ?? '', summary?.countries[iso], r1?.countries[iso]);
    }
    if (h.kind === 'abroadCity') {
      const c = abroadCities.find((x) => x.cd === h.cd);
      tip(h.x, h.y, c ? `${c.nm} · ${c.country}` : h.cd, abroadResults[h.cd], r1Abroad[h.cd]);
    }
  });
  new GlobeControls($('.controls'), globe, () => void apply(initialFilters()));

  // keep flights clear of the floating cards
  function updatePadding() {
    const top = $('#topbar').getBoundingClientRect();
    const side = $('#results').getBoundingClientRect();
    const dock = $('#dock').getBoundingClientRect();
    const m = 24;
    if (isWide()) {
      globe.setPadding({ top: top.bottom + m, bottom: m + 30, left: m + 56, right: Math.max(m, window.innerWidth - side.left + m) });
    } else {
      const dockH = Math.max(0, window.innerHeight - dock.top);
      d.root.style.setProperty('--dock-h', `${dockH}px`);
      globe.setPadding({ top: top.bottom + m, bottom: Math.max(m, dockH + m), left: m, right: m + 52 });
    }
  }
  const handle = $<HTMLButtonElement>('.sheet-handle');
  handle.addEventListener('click', () => {
    const open = !$('#results').classList.contains('expanded');
    $('#results').classList.toggle('expanded', open);
    handle.setAttribute('aria-expanded', String(open));
    handle.querySelector('em')!.textContent = open ? t('results_collapse') : t('results_expand');
    updatePadding();
  });
  window.addEventListener('resize', updatePadding);
  d.root.addEventListener('resize-card', updatePadding);

  paintGlobe();
  render();
  globe.focus(viewFor(filters));

  let polling = false;
  const poll = async () => {
    if (round !== 2 || document.visibilityState === 'hidden') return; // the first round is final
    if (polling) return; // one poll at a time (timer + tab coming back)
    polling = true;
    const epoch = viewEpoch;
    const [s, abroad, muni] = await Promise.all([
      d.api.summary().catch(() => null),
      d.api.abroadCities().catch(() => null),
      filters.uf ? d.api.municipalities(filters.uf).catch(() => null) : Promise.resolve(null),
      loadNotice(),
    ]).finally(() => { polling = false; });
    if (s) {
      summary = s;
      failedPolls = 0;
      checked.mark();
    } else {
      failedPolls++;
    }
    if (abroad) abroadResults = abroad.items;
    if (muni && filters.uf && muni.uf === filters.uf.toLowerCase()) municipalities = muni.items;
    const animate = epoch === viewEpoch && round === 2 && !prefersReducedMotion();
    paintGlobe(animate);
    render(animate);
  };
  const timer = window.setInterval(() => void poll(), d.pollMs ?? 30_000);
  // a tab coming back to the front refreshes right away instead of waiting for the next tick
  const onVisibility = () => void poll();
  document.addEventListener('visibilitychange', onVisibility);
  checked.start();

  return {
    dispose() {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      checked.stop();
      online.stop();
      window.removeEventListener('resize', updatePadding);
      for (const slot of adSlots) slot.stop();
    },
  };
}
