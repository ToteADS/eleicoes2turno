const intFmt = new Intl.NumberFormat('pt-BR');

export const formatInt = (n: number): string => intFmt.format(Math.round(n));

export const formatPct = (p: number, digits = 2): string =>
  `${(p * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

const BCP47: Record<string, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
const pctFmts = new Map<string, Intl.NumberFormat>();

/**
 * Map label with the share of sections totalized, e.g. "37,5%" (pt) or "37.5%" (en).
 * Rounded down to one decimal so an area only reads 100% once every section is in;
 * a count under 0.1% reads "<0,1%".
 * Null (no label) while nothing is counted there: no result, no sections or 0 totalized
 * (those areas are grey on the map anyway, and their "0%" would crowd out real numbers).
 */
export function sectionsLabel(r: { st: number; ts: number } | undefined, locale = 'pt'): string | null {
  if (!r || !(r.ts > 0) || !(r.st > 0)) return null;
  const tag = BCP47[locale] ?? locale;
  let fmt = pctFmts.get(tag);
  if (!fmt) {
    fmt = new Intl.NumberFormat(tag, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 1 });
    pctFmts.set(tag, fmt);
  }
  // the epsilon keeps exact fractions (3/8) from flooring a step down on float error
  const p = Math.floor((Math.min(r.st, r.ts) * 1000) / r.ts + 1e-9) / 1000;
  // something counted but under 0.1%: "<0,1%", never a "0%" that reads as nothing counted
  return p > 0 ? fmt.format(p) : `<${fmt.format(0.001)}`;
}
