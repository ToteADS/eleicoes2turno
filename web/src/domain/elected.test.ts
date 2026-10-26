import { displayName, electedCandidate } from './elected';
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
