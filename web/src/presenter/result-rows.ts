import { formatInt, formatPct } from '../domain/format';
import type { BaseResult } from '../domain/types';
import { t } from '../i18n';

const row = (k: string, v: string, pct?: string) => `<div class="row"><span>${k}</span><span><b>${v}</b>${pct ? `<em>${pct}</em>` : ''}</span></div>`;

/** Valid, blank, null, turnout, abstention and electorate rows shared by both rounds' cards. */
export function resultRows(r: BaseResult | undefined): string {
  if (!r) return '';
  return [
    r.released ? row(t('results_valid'), formatInt(r.vv), r.comp ? formatPct(r.vv / r.comp) : undefined) : '',
    r.released ? row(t('results_blank'), formatInt(r.vb), r.comp ? formatPct(r.vb / r.comp) : undefined) : '',
    r.released ? row(t('results_null'), formatInt(r.vn), r.comp ? formatPct(r.vn / r.comp) : undefined) : '',
    r.released ? row(t('results_turnout'), formatInt(r.comp), r.comp + r.abst ? formatPct(r.comp / (r.comp + r.abst)) : undefined) : '',
    r.released ? row(t('results_abstention'), formatInt(r.abst), r.comp + r.abst ? formatPct(r.abst / (r.comp + r.abst)) : undefined) : '',
    row(t('results_electorate'), formatInt(r.el)),
  ].join('');
}
