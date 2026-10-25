import type { MultiResult, Round1Candidate, Round1Summary } from '../domain/types';

/** [el, comp, abst, vv, vb, vn, st, ts, ...votes] — see data/build_r1.py */
type Packed = number[];
const FIELDS = 8;

interface RawSummary {
  dg: string;
  hg: string;
  candidates: Round1Candidate[];
  br: Packed;
  brUfsSum: Packed;
  zz: Packed;
  ufs: Record<string, Packed>;
  countries: Record<string, Packed>;
}

export function decodeArea(a: Packed, dg: string, hg: string): MultiResult {
  const [el, comp, abst, vv, vb, vn, st, ts] = a;
  return { el, comp, abst, vv, vb, vn, st, ts, dg, hg, released: st > 0, votes: a.slice(FIELDS) };
}

const decodeAll = (items: Record<string, Packed>, dg: string, hg: string) =>
  Object.fromEntries(Object.entries(items).map(([k, v]) => [k, decodeArea(v, dg, hg)]));

/**
 * Loads the final first-round result from the static snapshot in web/public/data/r1.
 * The files never change, so every one is fetched at most once (failures are retried).
 */
export class Round1Loader {
  private cache = new Map<string, Promise<unknown>>();

  constructor(private readonly fetchFn: typeof fetch = (...args) => fetch(...args)) {}

  summary(): Promise<Round1Summary> {
    return this.once('summary', async () => {
      const raw = await this.get<RawSummary>('/data/r1/summary.json');
      const area = (a: Packed) => decodeArea(a, raw.dg, raw.hg);
      return {
        dg: raw.dg, hg: raw.hg, candidates: raw.candidates,
        br: area(raw.br), brUfsSum: area(raw.brUfsSum), zz: area(raw.zz),
        ufs: decodeAll(raw.ufs, raw.dg, raw.hg), countries: decodeAll(raw.countries, raw.dg, raw.hg),
      };
    });
  }

  /** Municipalities of a state, keyed by IBGE id. */
  municipalities(uf: string): Promise<Record<string, MultiResult>> {
    return this.list(`mun/${uf.toLowerCase()}`);
  }

  /** Abroad cities, keyed by TSE code. */
  abroadCities(): Promise<Record<string, MultiResult>> {
    return this.list('abroad');
  }

  private list(name: string): Promise<Record<string, MultiResult>> {
    return this.once(name, async () => {
      const s = await this.summary();
      return decodeAll(await this.get<Record<string, Packed>>(`/data/r1/${name}.json`), s.dg, s.hg);
    });
  }

  private once<T>(key: string, run: () => Promise<T>): Promise<T> {
    let p = this.cache.get(key) as Promise<T> | undefined;
    if (!p) {
      p = run();
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
    }
    return p;
  }

  private async get<T>(url: string): Promise<T> {
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
    return (await res.json()) as T;
  }
}
