import type { MapOptions, MapType } from '../domain/map-options';
import { t } from '../i18n';

/**
 * "Tipo de mapa" select (Porcentagem | Mais votos) and the "% de urnas apuradas" switch,
 * inside the filters card. Second round only: hidden in the first round, which is final.
 */
export class MapOptionsControl {
  private options!: MapOptions;
  private listeners: ((o: MapOptions) => void)[] = [];
  private type: HTMLSelectElement;
  private labels: HTMLInputElement;

  constructor(private readonly el: HTMLElement) {
    el.innerHTML = `
      <label class="f"><span>${t('map_type')}</span><select id="fMapType">
        <option value="share">${t('map_type_share')}</option><option value="leader">${t('map_type_leader')}</option>
      </select></label>
      <label class="f f-switch"><span>${t('map_labels')}</span><span class="switch">
        <input type="checkbox" id="fSections" role="switch"><i aria-hidden="true"></i><em>${t('map_labels_sections')}</em>
      </span></label>`;
    this.type = el.querySelector('#fMapType')!;
    this.labels = el.querySelector('#fSections')!;
    this.type.addEventListener('change', () => this.emit({ ...this.options, type: this.type.value as MapType }));
    this.labels.addEventListener('change', () => this.emit({ ...this.options, sectionLabels: this.labels.checked }));
  }

  onChange(cb: (o: MapOptions) => void): void {
    this.listeners.push(cb);
  }

  render(options: MapOptions, visible: boolean): void {
    this.options = options;
    this.el.hidden = !visible;
    this.type.value = options.type;
    this.labels.checked = options.sectionLabels;
  }

  private emit(o: MapOptions): void {
    this.listeners.forEach((cb) => cb(o));
  }
}
