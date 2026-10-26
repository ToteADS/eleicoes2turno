import type { AreaResult, Candidate } from './types';

/** Short names the site shows for the runoff candidates. */
export const DISPLAY_NAME: Record<number, string> = { 13: 'Lula', 22: 'Flávio Bolsonaro' };

/** Display name of a candidate: our short form, else the TSE ballot name. */
export const displayName = (c: Pick<Candidate, 'n' | 'name'>): string => DISPLAY_NAME[c.n] ?? c.name;

/**
 * The candidate the TSE flagged as elected, or null. Only the TSE's own flag
 * counts (strictly `elected === true`): the winner is never inferred from votes.
 */
export function electedCandidate(candidates: readonly Candidate[] | null | undefined): Candidate | null {
  return candidates?.find((c) => c.elected === true) ?? null;
}

/** declared: the TSE flagged the candidate ("e": "s"); mathematical: the TSE marked the result as decided ("md": "e") */
export type WinnerKind = 'declared' | 'mathematical';

export interface Winner {
  candidate: Candidate;
  kind: WinnerKind;
}

/**
 * Who the site shows as elected, or null:
 * 1. the candidate the TSE flagged as elected;
 * 2. else, once the TSE marks the national result as mathematically decided,
 *    the candidate with the most votes in Brazil (a tie elects nobody);
 * 3. else nobody.
 */
export function resolveWinner(
  candidates: readonly Candidate[] | null | undefined,
  br: Pick<AreaResult, 'l' | 'f' | 'mathDefined'> | null | undefined,
): Winner | null {
  const declared = electedCandidate(candidates);
  if (declared) return { candidate: declared, kind: 'declared' };
  if (br?.mathDefined !== true || br.l === br.f) return null;
  const leader = candidates?.find((c) => c.n === (br.l > br.f ? 13 : 22));
  return leader ? { candidate: leader, kind: 'mathematical' } : null;
}
