import type { Candidate } from './types';

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
