import { formatPct } from '../domain/format';
import { ranking } from '../domain/multi';
import type { MultiResult, Round1Candidate } from '../domain/types';
import { t } from '../i18n';
import { CandidateList } from './candidate-list';
import { resultRows } from './result-rows';
import type { Scope } from './scope';

/** Results card of the first round: final result, every candidate ranked by votes. */
export class Round1Card {
  private list: CandidateList;

  constructor(private readonly el: HTMLElement) {
    el.innerHTML = `
      <div class="scope-head">
        <div class="crumb" data-ref="crumb"></div>
        <div class="scope" data-ref="title"></div>
        <div class="scope-sub" data-ref="sub"></div>
      </div>
      <div class="prog" aria-hidden="true"><i data-ref="prog"></i></div>
      <p class="status" data-ref="status" hidden></p>
      <div class="c1-wrap" data-ref="list"></div>
      <div class="rows" data-ref="rows"></div>
      <div class="updated" data-ref="updated"></div>`;
    this.list = new CandidateList(this.ref('list'));
  }

  render(scope: Scope<MultiResult>, candidates: Round1Candidate[]): void {
    const r = scope.result;
    this.ref('crumb').textContent = scope.crumb;
    this.ref('title').textContent = scope.title;
    this.ref('sub').textContent = scope.sub;
    const sections = r && r.ts > 0 ? r.st / r.ts : 0;
    this.ref('prog').style.transform = `scaleX(${sections})`;
    const status = this.ref('status');
    status.hidden = Boolean(r?.released);
    status.textContent = t('status_no_data');
    this.list.render(ranking(r, candidates));
    this.ref('rows').innerHTML = resultRows(r);
    this.ref('updated').textContent = r?.released ? t('r1_final', { pct: formatPct(sections, sections === 1 ? 0 : 2) }) : '';
  }

  private ref(name: string): HTMLElement {
    return this.el.querySelector<HTMLElement>(`[data-ref="${name}"]`)!;
  }
}
