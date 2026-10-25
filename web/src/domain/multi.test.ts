import { candidateColor, shade, PALETTE_FALLBACK } from './palette';
import { ranking, sumMulti, winnerIndex } from './multi';
import type { MultiResult, Round1Candidate } from './types';

const m = (votes: number[], extra: Partial<MultiResult> = {}): MultiResult => ({
  el: 100, comp: 80, abst: 20, vv: votes.reduce((a, b) => a + b, 0), vb: 3, vn: 2, st: 1, ts: 1,
  dg: '05/10/2026', hg: '12:51:47', released: true, votes, ...extra,
});
const cands: Round1Candidate[] = [
  { n: 22, name: 'Flávio Bolsonaro', party: 'PL', sqcand: '1', runoff: true },
  { n: 13, name: 'Lula', party: 'PT', sqcand: '2', runoff: true },
  { n: 70, name: 'Augusto Cury', party: 'AVANTE', sqcand: '3', runoff: false },
];

describe('winnerIndex', () => {
  it('is the candidate with most votes', () => {
    expect(winnerIndex(m([10, 30, 5]))).toBe(1);
  });
  it('has no winner on a tie at the top', () => {
    expect(winnerIndex(m([30, 30, 5]))).toBeNull();
  });
  it('has no winner without votes or data', () => {
    expect(winnerIndex(m([0, 0, 0]))).toBeNull();
    expect(winnerIndex(undefined)).toBeNull();
    expect(winnerIndex(m([5, 1], { released: false }))).toBeNull();
  });
});

describe('ranking', () => {
  it('sorts candidates by votes with their share of the valid votes', () => {
    const rows = ranking(m([10, 30, 60]), cands);
    expect(rows.map((r) => r.candidate.n)).toEqual([70, 13, 22]);
    expect(rows.map((r) => r.share)).toEqual([0.6, 0.3, 0.1]);
    expect(rows[0].votes).toBe(60);
  });
  it('keeps the national order on ties and without data', () => {
    expect(ranking(m([5, 5, 5]), cands).map((r) => r.candidate.n)).toEqual([22, 13, 70]);
    const none = ranking(undefined, cands);
    expect(none.map((r) => [r.candidate.n, r.votes, r.share])).toEqual([[22, 0, null], [13, 0, null], [70, 0, null]]);
  });
  it('treats missing votes as zero', () => {
    expect(ranking(m([4]), cands).map((r) => r.votes)).toEqual([4, 0, 0]);
  });
});

describe('sumMulti', () => {
  it('adds areas vote by vote and keeps the latest TSE time', () => {
    const s = sumMulti([m([1, 2], { hg: '10:00:00' }), m([3, 4, 5], { hg: '12:00:00', released: false })]);
    expect(s.votes).toEqual([4, 6, 5]);
    expect([s.el, s.vv, s.released, s.hg]).toEqual([200, 15, true, '12:00:00']);
  });
  it('an empty sum is not released', () => {
    expect(sumMulti([]).released).toBe(false);
  });
});

describe('palette', () => {
  it('keeps the round 2 colors for Lula and Flávio', () => {
    expect(candidateColor(13)).toBe('#d7262d');
    expect(candidateColor(22)).toBe('#1f5fe0');
  });
  it('gives the other candidates distinct colors', () => {
    const others = [70, 14, 55, 30, 80, 16, 27, 21, 35, 29].map(candidateColor);
    expect(new Set([...others, '#d7262d', '#1f5fe0']).size).toBe(12);
  });
  it('falls back to a stable color for unknown numbers', () => {
    expect(PALETTE_FALLBACK).toContain(candidateColor(99));
    expect(candidateColor(99)).toBe(candidateColor(99));
  });
  it('shades toward white for narrow wins and keeps the full color for landslides', () => {
    expect(shade('#d7262d', 0.9)).toBe('#d7262d');
    expect(shade('#000000', 0.2)).toBe('#8c8c8c');
    const mid = shade('#000000', 0.55);
    expect(mid > '#000000' && mid < '#8c8c8c').toBe(true);
  });
});
