import type { MultiResult, Round1Candidate } from './types';

export interface RankRow {
  candidate: Round1Candidate;
  votes: number;
  /** share of the valid votes, null while there is nothing to show */
  share: number | null;
}

const total = (r: MultiResult) => r.votes.reduce((a, b) => a + b, 0);
const key = (r: MultiResult) => (r.dg.length === 10 ? r.dg.slice(6) + r.dg.slice(3, 5) + r.dg.slice(0, 2) + r.hg : '');

/** Index of the candidate with most votes, or null without votes or on a tie at the top. */
export function winnerIndex(r: MultiResult | undefined): number | null {
  if (!r || !r.released || total(r) === 0) return null;
  let best = 0;
  for (let i = 1; i < r.votes.length; i++) if (r.votes[i] > r.votes[best]) best = i;
  return r.votes.filter((v) => v === r.votes[best]).length > 1 ? null : best;
}

/** Candidates sorted by votes in the area; ties keep the national order. */
export function ranking(r: MultiResult | undefined, candidates: Round1Candidate[]): RankRow[] {
  const sum = r?.released ? total(r) : 0;
  return candidates
    .map((candidate, i) => {
      const votes = r?.votes[i] ?? 0;
      return { candidate, votes, share: sum ? votes / sum : null, i };
    })
    .sort((a, b) => b.votes - a.votes || a.i - b.i)
    .map(({ candidate, votes, share }) => ({ candidate, votes, share }));
}

/** Adds areas together (regions, countries); carries the most recent TSE timestamp. */
export function sumMulti(list: MultiResult[]): MultiResult {
  const out: MultiResult = { el: 0, comp: 0, abst: 0, vv: 0, vb: 0, vn: 0, st: 0, ts: 0, dg: '', hg: '', released: false, votes: [] };
  for (const r of list) {
    out.el += r.el; out.comp += r.comp; out.abst += r.abst; out.vv += r.vv; out.vb += r.vb; out.vn += r.vn;
    out.st += r.st; out.ts += r.ts;
    r.votes.forEach((v, i) => { out.votes[i] = (out.votes[i] ?? 0) + v; });
    out.released ||= r.released;
    if (key(r) > key(out)) { out.dg = r.dg; out.hg = r.hg; }
  }
  return out;
}
