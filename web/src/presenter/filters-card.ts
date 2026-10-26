import { setCity, setCountry, setRegion, setUf, type Country, type FilterState } from '../domain/filters';
import type { Region } from '../domain/types';
import { t, type I18nKey } from '../i18n';

export interface FilterOptions {
  countries: { iso: number; name: string }[];
  states: { uf: string; name: string }[];
  /** cities of the selected state (IBGE id) or country (TSE code) */
  cities: { id: string; name: string }[];
}

const REGIONS: Region[] = ['N', 'NE', 'CO', 'SE', 'S'];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The floating filters card: País → Região → Estado → Cidade. */
export class FiltersCard {
  private state!: FilterState;
  private opts: FilterOptions = { countries: [], states: [], cities: [] };
  private listeners: ((s: FilterState) => void)[] = [];
  private country: HTMLSelectElement;
  private region: HTMLSelectElement;
  private uf: HTMLSelectElement;
  private city: HTMLInputElement;
  private list: HTMLDataListElement;

  constructor(private readonly el: HTMLElement) {
    el.innerHTML = `
      <div class="topbar-head">
        <h1><span class="t-long">${t('app_title')}</span><span class="t-short">${t('app_title_short')}</span> <small>${t('app_office')}</small></h1>
        <div class="round-slot"></div>
        <button type="button" class="filters-toggle" aria-expanded="false" aria-controls="filters">${t('filters_open')}</button>
      </div>
      <div class="filters" id="filters">
        <label class="f"><span>${t('filters_country')}</span><select id="fCountry"></select></label>
        <label class="f"><span>${t('filters_region')}</span><select id="fRegion"></select></label>
        <label class="f"><span>${t('filters_state')}</span><select id="fUf"></select></label>
        <label class="f"><span>${t('filters_city')}</span><input id="fCity" list="cityList" autocomplete="off" spellcheck="false"><datalist id="cityList"></datalist></label>
        <div class="map-slot"></div>
      </div>`;
    this.country = el.querySelector('#fCountry')!;
    this.region = el.querySelector('#fRegion')!;
    this.uf = el.querySelector('#fUf')!;
    this.city = el.querySelector('#fCity')!;
    this.list = el.querySelector('#cityList')!;

    this.country.addEventListener('change', () => {
      const v = this.country.value;
      this.emit(setCountry(this.state, (v === 'ALL' || v === 'BR' ? v : Number(v)) as Country));
    });
    this.region.addEventListener('change', () => this.emit(setRegion(this.state, this.region.value as Region | 'ALL')));
    this.uf.addEventListener('change', () => this.emit(setUf(this.state, this.uf.value || null)));
    this.city.addEventListener('change', () => {
      const name = this.city.value.trim().toLowerCase();
      const hit = this.opts.cities.find((c) => c.name.toLowerCase() === name);
      if (hit && hit.id !== this.state.city) this.emit(setCity(this.state, hit.id));
    });
    const toggle = el.querySelector<HTMLButtonElement>('.filters-toggle')!;
    toggle.addEventListener('click', () => {
      const open = !el.classList.contains('open');
      el.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? t('filters_close') : t('filters_open');
      el.dispatchEvent(new CustomEvent('resize-card', { bubbles: true }));
    });
  }

  /** Where the round toggle goes, between the title and the filters button. */
  get roundSlot(): HTMLElement {
    return this.el.querySelector('.round-slot')!;
  }

  /** Where the map options (type of map, section labels) go, after the area filters. */
  get mapSlot(): HTMLElement {
    return this.el.querySelector('.map-slot')!;
  }

  setTitle(title: string): void {
    this.el.querySelector('.t-long')!.textContent = title;
  }

  onChange(cb: (s: FilterState) => void): void {
    this.listeners.push(cb);
  }

  render(state: FilterState, opts: FilterOptions): void {
    this.state = state;
    this.opts = opts;
    const br = state.country === 'BR';

    this.country.innerHTML =
      `<option value="ALL">${t('filters_all_countries')}</option><option value="BR">${t('filters_brazil')}</option>` +
      `<optgroup label="${t('filters_abroad')}">${opts.countries.map((c) => `<option value="${c.iso}">${esc(c.name)}</option>`).join('')}</optgroup>`;
    this.country.value = String(state.country);

    this.region.innerHTML = `<option value="ALL">${t('filters_all')}</option>` +
      REGIONS.map((r) => `<option value="${r}">${t(`region_${r}` as I18nKey)}</option>`).join('');
    this.region.value = br ? state.region : 'ALL';
    this.region.disabled = state.country !== 'BR' && state.country !== 'ALL';

    this.uf.innerHTML = `<option value="">${t('filters_all_states')}</option>` +
      opts.states.map((s) => `<option value="${s.uf}">${esc(s.name)}</option>`).join('');
    this.uf.value = br && state.uf ? state.uf : '';
    this.uf.disabled = this.region.disabled;

    const canCity = br ? Boolean(state.uf) : typeof state.country === 'number';
    this.city.disabled = !canCity;
    this.city.placeholder = canCity ? t('filters_city_search') : t('filters_city_pick_state');
    this.list.innerHTML = opts.cities.map((c) => `<option value="${esc(c.name)}"></option>`).join('');
    const current = opts.cities.find((c) => c.id === state.city);
    this.city.value = current ? current.name : '';
  }

  close(): void {
    if (this.el.classList.contains('open')) this.el.querySelector<HTMLButtonElement>('.filters-toggle')!.click();
  }

  private emit(s: FilterState): void {
    this.listeners.forEach((cb) => cb(s));
  }
}
