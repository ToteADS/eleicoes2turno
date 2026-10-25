/**
 * One color per first-round candidate (by ballot number). Lula and Flávio keep the
 * red and blue of the second round (--lula, --flavio); the rest are distinct hues
 * that stay apart from those two and from the grey of areas without data.
 */
const COLORS: Record<number, string> = {
  13: '#d7262d', // Lula
  22: '#1f5fe0', // Flávio Bolsonaro
  70: '#f28e2b',
  14: '#2e9e5b',
  55: '#7b4fc9',
  30: '#138d9c',
  80: '#b0307a',
  16: '#8b5a2b',
  27: '#7d9a1e',
  21: '#5b6b7f',
  35: '#e58fc0',
  29: '#2f3b45',
};

export const PALETTE_FALLBACK = ['#c7a400', '#6d4c9f', '#3f8f8a', '#a35d00'];

export function candidateColor(n: number): string {
  return COLORS[n] ?? PALETTE_FALLBACK[n % PALETTE_FALLBACK.length];
}

/** Narrow wins (≤35%) are pale, landslides (≥75%) get the full color. */
const PALE = 0.35;
const FULL = 0.75;
const MIN_MIX = 0.45;

/** Mixes the color toward white by how clear the win is (share of the valid votes). */
export function shade(hex: string, share: number): string {
  const t = Math.min(1, Math.max(0, (share - PALE) / (FULL - PALE)));
  const mix = MIN_MIX + (1 - MIN_MIX) * t;
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
    return Math.round(255 - (255 - c) * mix).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}
