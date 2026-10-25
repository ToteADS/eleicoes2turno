import type { Round } from '../domain/types';

const PARAM = 'turno';

/** `?turno=1` opens the first round; anything else is the second (the default). */
export function readRound(search: string): Round {
  return new URLSearchParams(search).get(PARAM) === '1' ? 1 : 2;
}

/** Path + query + hash of `href` for `round`; the default round leaves the URL clean. */
export function roundUrl(href: string, round: Round): string {
  const url = new URL(href);
  if (round === 1) url.searchParams.set(PARAM, '1');
  else url.searchParams.delete(PARAM);
  return url.pathname + url.search + url.hash;
}
