// Mirrors the API contract served by api/ (see docs/superpowers/plans).

export interface AreaResult {
  el: number;
  comp: number;
  abst: number;
  vv: number;
  vb: number;
  vn: number;
  l: number;
  f: number;
  st: number;
  ts: number;
  dg: string;
  hg: string;
  released: boolean;
}

export interface Candidate {
  n: number;
  name: string;
  party: string;
  sqcand: string;
}

export interface Summary {
  updatedAt: string;
  stale: boolean;
  candidates: Candidate[];
  br: AreaResult;
  brUfsSum: AreaResult;
  zz: AreaResult;
  ufs: Record<string, AreaResult>;
  countries: Record<string, AreaResult>;
}

export interface AreaListResponse {
  uf?: string;
  updatedAt: string;
  items: Record<string, AreaResult>;
}

export interface PublicConfig {
  ads: {
    adsenseClient: string;
    slotResults: string;
    slotMobile: string;
    house: { image: string; link: string; alt: string };
  };
}

/** City abroad with polling stations; country grouping is ours (TSE has none). */
export interface AbroadCity {
  cd: string;
  nm: string;
  country: string;
  iso: number;
  lat: number;
  lon: number;
}

export type Region = 'N' | 'NE' | 'CO' | 'SE' | 'S';
