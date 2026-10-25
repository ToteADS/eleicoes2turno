import { winnerIndex } from '../domain/multi';
import { candidateColor, shade } from '../domain/palette';
import type { MultiResult, Round1Candidate } from '../domain/types';
import type { SolidFill } from '../infra/globe';

/** First-round map colors: each area in its winner's color, paler when the win is narrow. */
export function round1Fills(items: Record<string, MultiResult>, candidates: Round1Candidate[]): Record<string, SolidFill> {
  const out: Record<string, SolidFill> = {};
  for (const [id, r] of Object.entries(items)) {
    const w = winnerIndex(r);
    out[id] = { fill: w === null ? null : shade(candidateColor(candidates[w].n), r.votes[w] / r.votes.reduce((a, b) => a + b, 0)), el: r.el };
  }
  return out;
}
