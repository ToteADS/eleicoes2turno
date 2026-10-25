import type { AreaResult } from './types';

const key = (r: AreaResult) => (r.dg.length === 10 ? r.dg.slice(6) + r.dg.slice(3, 5) + r.dg.slice(0, 2) + r.hg : '');

/** Adds areas together (used for regions); carries the most recent TSE timestamp. */
export function sumResults(list: AreaResult[]): AreaResult {
  const out: AreaResult = { el: 0, comp: 0, abst: 0, vv: 0, vb: 0, vn: 0, l: 0, f: 0, st: 0, ts: 0, dg: '', hg: '', released: false };
  for (const r of list) {
    out.el += r.el; out.comp += r.comp; out.abst += r.abst; out.vv += r.vv; out.vb += r.vb; out.vn += r.vn;
    out.l += r.l; out.f += r.f; out.st += r.st; out.ts += r.ts;
    out.released ||= r.released;
    if (key(r) > key(out)) { out.dg = r.dg; out.hg = r.hg; }
  }
  return out;
}
