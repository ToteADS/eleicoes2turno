import { formatInt, formatPct } from '../domain/format';
import type { BaseResult } from '../domain/types';
import { t } from '../i18n';

/** One line of the totals: a count and, for most, its share. */
export interface ResultRow {
  label: string;
  value: number;
  pct?: number;
}

const row = (k: string, v: string, pct?: string) => `<div class="row"><span>${k}</span><span><b>${v}</b>${pct !== undefined ? `<em>${pct}</em>` : ''}</span></div>`;

/** Valid, blank, null, turnout, abstention and electorate, shared by both rounds' cards. */
export function resultRowData(r: BaseResult | undefined): ResultRow[] {
  if (!r) return [];
  const voters = r.comp + r.abst;
  const of = (n: number, total: number) => (total ? n / total : undefined);
  return [
    ...(r.released ? [
      { label: t('results_valid'), value: r.vv, pct: of(r.vv, r.comp) },
      { label: t('results_blank'), value: r.vb, pct: of(r.vb, r.comp) },
      { label: t('results_null'), value: r.vn, pct: of(r.vn, r.comp) },
      { label: t('results_turnout'), value: r.comp, pct: of(r.comp, voters) },
      { label: t('results_abstention'), value: r.abst, pct: of(r.abst, voters) },
    ] : []),
    { label: t('results_electorate'), value: r.el },
  ];
}

export function resultRowsHtml(rows: ResultRow[]): string {
  return rows.map((x) => row(x.label, formatInt(x.value), x.pct === undefined ? undefined : formatPct(x.pct))).join('');
}

export function resultRows(r: BaseResult | undefined): string {
  return resultRowsHtml(resultRowData(r));
}
