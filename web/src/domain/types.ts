// Mirrors the API contract served by api/ (see docs/superpowers/plans).

/** What every area has in both rounds: electorate, turnout and the vote totals. */
export interface BaseResult {
  el: number;
  comp: number;
  abst: number;
  vv: number;
  vb: number;
  vn: number;
  st: number;
  ts: number;
  dg: string;
  hg: string;
  released: boolean;
}

/** Second round: Lula (l) × Flávio (f). */
export interface AreaResult extends BaseResult {
  l: number;
  f: number;
}

/** First round: votes aligned with Round1Summary.candidates. */
export interface MultiResult extends BaseResult {
  votes: number[];
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

export interface Round1Candidate extends Candidate {
  /** went on to the second round */
  runoff: boolean;
}

/** Final first-round result, served as a static snapshot (never polled). */
export interface Round1Summary {
  dg: string;
  hg: string;
  /** sorted by votes in Brazil; every MultiResult.votes follows this order */
  candidates: Round1Candidate[];
  br: MultiResult;
  brUfsSum: MultiResult;
  zz: MultiResult;
  ufs: Record<string, MultiResult>;
  countries: Record<string, MultiResult>;
}

export type Round = 1 | 2;

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

/** Answer to a presence heartbeat: tabs online right now. */
export interface PresenceAnswer {
  online: number;
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
