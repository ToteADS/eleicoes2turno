import { initialFilters, setCity, setCountry, setUf, type FilterState } from '../domain/filters';
import type { AbroadCity, AreaListResponse, AreaResult, PublicConfig, Summary } from '../domain/types';
import { latest } from '../infra/api';
import type { AreaCollection, GlobePick, GlobeRenderer, GlobeView } from '../infra/globe';
import { t } from '../i18n';
import { AdSlot } from './ad-slot';
import { CreatorCredit } from './creator-credit';
import { FiltersCard } from './filters-card';
import { GlobeControls } from './globe-controls';
import { ResultsCard } from './results-card';
import { NullGlobe } from './null-globe';
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
  };
  geo: {
    states(): Promise<AreaCollection>;
    world(): Promise<AreaCollection>;
    municipalities(uf: string): Promise<AreaCollection>;
    abroadCities(): Promise<AbroadCity[]>;
  };
  pollMs?: number;
}

const DEFAULT_CONFIG: PublicConfig = {
  ads: { adsenseClient: '', slotResults: '', slotMobile: '', house: { image: '/ads/tapp-banner.svg', link: 'https://tapp.solutions', alt: 'Tapp Solutions' } },
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
        <div class="results-body"></div>
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
  const resultsCard = new ResultsCard($('.results-body'));
  const tooltip = new Tooltip($('.tip'));

  let filters = initialFilters();
  let summary: Summary | null = null;
  let municipalities: Record<string, AreaResult> = {};
  let muniGeo: AreaCollection | null = null;
  let abroadResults: Record<string, AreaResult> = {};

  const emptyAreas = (): AreaCollection => ({ type: 'FeatureCollection', features: [] });
  const [config, states, world, abroadCities] = await Promise.all([
    d.api.config().catch(() => DEFAULT_CONFIG),
    d.geo.states().catch(() => emptyAreas()),
    d.geo.world().catch(() => emptyAreas()),
    d.geo.abroadCities().catch(() => [] as AbroadCity[]),
  ]);
  let failedPolls = 0;
  summary = await d.api.summary().catch(() => { failedPolls++; return null; });
  abroadResults = (await d.api.abroadCities().catch(() => null))?.items ?? {};

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
  const paintGlobe = () => {
    globe.setStates(states, summary?.ufs ?? {});
    globe.setWorld(world, summary?.countries ?? {});
    globe.setAbroadCities(abroadCities, abroadResults);
    globe.setMunicipalities(filters.uf, muniGeo, municipalities);
  };

  const muniNames = () => Object.fromEntries((muniGeo?.features ?? []).map((f) => [String(f.properties?.id), String(f.properties?.name)]));
  const render = () => {
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
    const scope = describeScope(filters, {
      summary, stateNames, abroadCities, municipalities, municipalityNames: names,
      municipalityCount: muniGeo?.features.length ?? 0, abroadResults,
    });
    const staleTime = summary ? new Date(summary.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    resultsCard.render(scope, summary?.candidates ?? [], isStale(summary, failedPolls), staleTime);
    updatePadding();
  };

  const loadMunicipalities = async (uf: string | null): Promise<boolean> => {
    if (!uf) {
      muniGeo = null;
      municipalities = {};
      return true;
    }
    const got = await latest('mun', () =>
      Promise.all([d.geo.municipalities(uf), d.api.municipalities(uf).catch(() => null)]).catch(() => null));
    if (got === undefined) return false; // a newer selection won
    // on failure clear the previous state's data rather than showing it under the new state
    [muniGeo, municipalities] = got ? [got[0], got[1]?.items ?? {}] : [null, {}];
    return true;
  };

  const apply = async (next: FilterState) => {
    const ufChanged = next.uf !== filters.uf;
    filters = next;
    render();
    if (ufChanged && !(await loadMunicipalities(next.uf))) return;
    if (next !== filters) return; // superseded while loading
    globe.setMunicipalities(filters.uf, muniGeo, municipalities);
    globe.focus(viewFor(filters));
    filtersCard.close();
    render();
  };
  filtersCard.onChange((s) => void apply(s));

  globe.onPick((p: GlobePick) => {
    if (p.kind === 'uf') void apply(setUf(filters, p.uf));
    if (p.kind === 'municipality' && filters.uf) void apply(setCity(filters, p.id));
    if (p.kind === 'country') void apply(setCountry(filters, p.iso));
    if (p.kind === 'abroadCity') {
      const c = abroadCities.find((x) => x.cd === p.cd);
      if (c) void apply(setCity(setCountry(filters, c.iso), c.cd));
    }
  });
  globe.onHover((h) => {
    if (!h) return tooltip.hide();
    if (h.kind === 'uf') tooltip.show(h.x, h.y, stateNames[h.uf] ?? h.uf, summary?.ufs[h.uf.toLowerCase()]);
    if (h.kind === 'municipality') tooltip.show(h.x, h.y, muniNames()[h.id] ?? h.id, municipalities[h.id]);
    if (h.kind === 'country') tooltip.show(h.x, h.y, countries.find((c) => c.iso === h.iso)?.name ?? '', summary?.countries[String(h.iso)]);
    if (h.kind === 'abroadCity') {
      const c = abroadCities.find((x) => x.cd === h.cd);
      tooltip.show(h.x, h.y, c ? `${c.nm} · ${c.country}` : h.cd, abroadResults[h.cd]);
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

  const poll = async () => {
    if (document.visibilityState === 'hidden') return;
    const [s, abroad, muni] = await Promise.all([
      d.api.summary().catch(() => null),
      d.api.abroadCities().catch(() => null),
      filters.uf ? d.api.municipalities(filters.uf).catch(() => null) : Promise.resolve(null),
    ]);
    if (s) {
      summary = s;
      failedPolls = 0;
    } else {
      failedPolls++;
    }
    if (abroad) abroadResults = abroad.items;
    if (muni && filters.uf && muni.uf === filters.uf.toLowerCase()) municipalities = muni.items;
    paintGlobe();
    render();
  };
  const timer = window.setInterval(() => void poll(), d.pollMs ?? 30_000);

  return {
    dispose() {
      window.clearInterval(timer);
      window.removeEventListener('resize', updatePadding);
      for (const slot of adSlots) slot.stop();
    },
  };
}
