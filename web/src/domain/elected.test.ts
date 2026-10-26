import { displayName, electedCandidate, resolveWinner } from './elected';
import type { Candidate } from './types';

const lula: Candidate = { n: 13, name: 'LULA', party: 'PT', sqcand: '1' };
const flavio: Candidate = { n: 22, name: 'FLAVIO BOLSONARO', party: 'PL', sqcand: '2' };

describe('electedCandidate', () => {
  it('is null until the TSE flags someone', () => {
    expect(electedCandidate(null)).toBeNull();
    expect(electedCandidate(undefined)).toBeNull();
    expect(electedCandidate([])).toBeNull();
    expect(electedCandidate([lula, flavio])).toBeNull();
    expect(electedCandidate([{ ...lula, elected: false, status: '' }, flavio])).toBeNull();
  });

  it('only trusts a strict true flag', () => {
    expect(electedCandidate([{ ...lula, elected: 's' as unknown as boolean }])).toBeNull();
  });

  it('returns the flagged candidate', () => {
    const won = { ...flavio, elected: true, status: 'Eleito' };
    expect(electedCandidate([lula, won])).toBe(won);
  });
});

describe('displayName', () => {
  it('uses the short names, falling back to the TSE name', () => {
    expect(displayName(lula)).toBe('Lula');
    expect(displayName(flavio)).toBe('Flávio Bolsonaro');
    expect(displayName({ n: 99, name: 'OUTRO' })).toBe('OUTRO');
  });
});

describe('resolveWinner', () => {
  const br = (l: number, f: number, mathDefined?: boolean) => ({ l, f, mathDefined });

  it('prefers the candidate the TSE declared, even against the vote count', () => {
    const won = { ...flavio, elected: true };
    expect(resolveWinner([lula, won], br(900, 100, true))).toEqual({ candidate: won, kind: 'declared' });
    expect(resolveWinner([lula, won], null)).toEqual({ candidate: won, kind: 'declared' });
  });

  it('elects the national leader once the TSE marks the result as decided', () => {
    expect(resolveWinner([lula, flavio], br(64242718, 59819188, true))).toEqual({ candidate: lula, kind: 'mathematical' });
    expect(resolveWinner([lula, flavio], br(100, 900, true))).toEqual({ candidate: flavio, kind: 'mathematical' });
  });

  it('elects nobody without the flags', () => {
    expect(resolveWinner([lula, flavio], br(900, 100))).toBeNull();
    expect(resolveWinner([lula, flavio], br(900, 100, false))).toBeNull();
    expect(resolveWinner([lula, flavio], { ...br(900, 100), mathDefined: 'e' as unknown as boolean })).toBeNull();
    expect(resolveWinner([lula, flavio], null)).toBeNull();
    expect(resolveWinner(null, undefined)).toBeNull();
  });

  it('elects nobody on a tie or when the leader is not listed', () => {
    expect(resolveWinner([lula, flavio], br(500, 500, true))).toBeNull();
    expect(resolveWinner([flavio], br(900, 100, true))).toBeNull();
    expect(resolveWinner(null, br(900, 100, true))).toBeNull();
  });
});
