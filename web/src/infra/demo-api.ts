// DEV ONLY (?demo=anim): loaded from main.ts behind import.meta.env.DEV, so production
// builds never include it. Fakes a moving count to show the live-update animations.
import type { AreaListResponse, AreaResult, Summary } from '../domain/types';
import type { AppDeps } from '../presenter/app';

type Api = AppDeps['api'];
export const DEMO_POLL_MS = 5_000;

const grow = (n: number, max: number, rand: () => number) => Math.round(n * (1 + rand() * max));

/** Every count grows a little (each candidate by its own amount) and more sections come in. */
export function bump(r: AreaResult, rand: () => number = Math.random): AreaResult {
  if (!r.released) return r;
  const l = grow(r.l, 0.12, rand);
  const f = grow(r.f, 0.12, rand);
  const vb = grow(r.vb, 0.03, rand);
  const vn = grow(r.vn, 0.03, rand);
  const vv = l + f;
  return { ...r, l, f, vb, vn, vv, comp: vv + vb + vn, st: Math.min(r.ts, r.st + Math.max(1, Math.round(r.ts * 0.03))) };
}

const bumpAll = (items: Record<string, AreaResult>, rand: () => number) =>
  Object.fromEntries(Object.entries(items).map(([k, v]) => [k, bump(v, rand)]));

/** The real API, with every answer after the first moved on a bit from the one before. */
export function demoApi(api: Api, rand: () => number = Math.random): Api {
  let summary: Summary | null = null;
  const lists = new Map<string, AreaListResponse>();
  const list = (key: string, load: () => Promise<AreaListResponse>) => async () => {
    const prev = lists.get(key);
    const next = prev ? { ...prev, items: bumpAll(prev.items, rand) } : await load();
    lists.set(key, next);
    return next;
  };
  return {
    ...api,
    config: () => api.config(),
    presence: (dto) => api.presence(dto),
    notice: () => api.notice(),
    summary: async () => {
      summary = summary
        ? { ...summary, br: bump(summary.br, rand), brUfsSum: bump(summary.brUfsSum, rand), zz: bump(summary.zz, rand), ufs: bumpAll(summary.ufs, rand), countries: bumpAll(summary.countries, rand) }
        : await api.summary();
      return summary;
    },
    abroadCities: () => list('abroad', () => api.abroadCities())(),
    municipalities: (uf) => list(`mun:${uf}`, () => api.municipalities(uf))(),
  };
}
