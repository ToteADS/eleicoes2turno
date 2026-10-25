import type { Region } from './types';

/** 'ALL' = every country with votes (default), 'BR' = Brazil only, number = ISO code of a country abroad. */
export type Country = 'ALL' | 'BR' | number;

export interface FilterState {
  country: Country;
  region: Region | 'ALL';
  uf: string | null;
  city: string | null;
}

export const REGION_OF: Record<string, Region> = {
  AC: 'N', AM: 'N', AP: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N',
  AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE',
  DF: 'CO', GO: 'CO', MT: 'CO', MS: 'CO',
  ES: 'SE', MG: 'SE', RJ: 'SE', SP: 'SE',
  PR: 'S', RS: 'S', SC: 'S',
};

export const initialFilters = (): FilterState => ({ country: 'ALL', region: 'ALL', uf: null, city: null });

export const setCountry = (_s: FilterState, country: Country): FilterState => ({ country, region: 'ALL', uf: null, city: null });

export const setRegion = (s: FilterState, region: Region | 'ALL'): FilterState => ({ ...s, country: 'BR', region, uf: null, city: null });

export const setUf = (s: FilterState, uf: string | null): FilterState =>
  uf ? { country: 'BR', region: REGION_OF[uf], uf, city: null } : { ...s, uf: null, city: null };

export const setCity = (s: FilterState, city: string | null): FilterState => ({ ...s, city });
