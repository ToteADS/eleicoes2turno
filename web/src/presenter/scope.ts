import { sumResults } from '../domain/aggregate';
import { REGION_OF, type FilterState } from '../domain/filters';
import type { AbroadCity, AreaResult, BaseResult } from '../domain/types';
import { t, type I18nKey } from '../i18n';

/** What the results card shows for the current filters (R: a result of either round). */
export interface Scope<R extends BaseResult = AreaResult> {
  crumb: string;
  title: string;
  sub: string;
  result: R | undefined;
}

/** The tables of one round that describeScope reads (Summary and Round1Summary both fit). */
export interface ScopeTotals<R> {
  br: R;
  brUfsSum: R;
  ufs: Record<string, R>;
  countries: Record<string, R>;
}

export interface ScopeData<R extends BaseResult = AreaResult> {
  summary: ScopeTotals<R> | null;
  stateNames: Record<string, string>;
  abroadCities: AbroadCity[];
  municipalities: Record<string, R>;
  municipalityNames: Record<string, string>;
  municipalityCount: number;
  abroadResults: Record<string, R>;
  /** adds up the states of a region; defaults to the second-round sum */
  sum?: (list: R[]) => R;
}

const regionName = (r: string) => t(`region_${r}` as I18nKey);

export function describeScope<R extends BaseResult = AreaResult>(f: FilterState, d: ScopeData<R>): Scope<R> {
  const s = d.summary;
  const sum = d.sum ?? (sumResults as unknown as (list: R[]) => R);
  if (f.country === 'ALL') {
    return { crumb: '', title: t('filters_all_countries'), sub: t('results_official_total'), result: s?.br };
  }
  if (f.country === 'BR') {
    const brazil = t('filters_brazil');
    if (f.uf && f.city) {
      return {
        crumb: `${brazil} › ${regionName(REGION_OF[f.uf])} › ${d.stateNames[f.uf] ?? f.uf}`,
        title: d.municipalityNames[f.city] ?? f.city,
        sub: t('results_municipality'),
        result: d.municipalities[f.city],
      };
    }
    if (f.uf) {
      return {
        crumb: `${brazil} › ${regionName(REGION_OF[f.uf])}`,
        title: d.stateNames[f.uf] ?? f.uf,
        sub: t('results_municipalities_count', { n: d.municipalityCount }),
        result: s?.ufs[f.uf.toLowerCase()],
      };
    }
    if (f.region !== 'ALL') {
      const ufs = Object.keys(REGION_OF).filter((uf) => REGION_OF[uf] === f.region);
      const parts = s ? ufs.map((uf) => s.ufs[uf.toLowerCase()]).filter(Boolean) : [];
      return {
        crumb: brazil,
        title: regionName(f.region),
        sub: `${t('results_states_count', { n: ufs.length })} · ${t('results_sum_states')}`,
        result: s ? sum(parts) : undefined,
      };
    }
    return { crumb: '', title: brazil, sub: t('results_sum_states'), result: s?.brUfsSum };
  }

  const cities = d.abroadCities.filter((c) => c.iso === f.country);
  const countryName = cities[0]?.country ?? String(f.country);
  const abroad = t('filters_abroad');
  if (f.city) {
    const city = cities.find((c) => c.cd === f.city);
    const result = d.abroadResults[f.city];
    return {
      crumb: `${abroad} › ${countryName}`,
      title: city?.nm ?? f.city,
      sub: t('results_sections_count', { n: result?.ts ?? 0 }),
      result,
    };
  }
  return {
    crumb: abroad,
    title: countryName,
    sub: `${t('results_cities_count', { n: cities.length })} · ${t('results_sum_cities')}`,
    result: s?.countries[String(f.country)],
  };
}
