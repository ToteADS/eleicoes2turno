import type { PublicConfig } from '../domain/types';
import { t } from '../i18n';

export type AdPlacement = 'results' | 'mobile';

const ADSENSE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

/** Ad space: AdSense when configured for this placement, otherwise our own banner. */
export class AdSlot {
  constructor(private readonly el: HTMLElement, private readonly placement: AdPlacement) {}

  render(config: PublicConfig): void {
    const { adsenseClient, slotResults, slotMobile, house } = config.ads;
    const slot = this.placement === 'results' ? slotResults : slotMobile;
    const label = `<span class="ad-label">${t('ads_label')}</span>`;

    if (adsenseClient && slot) {
      this.el.innerHTML = `${label}<ins class="adsbygoogle" style="display:block"></ins>`;
      const ins = this.el.querySelector('ins')!;
      ins.setAttribute('data-ad-client', adsenseClient);
      ins.setAttribute('data-ad-slot', slot);
      ins.setAttribute('data-ad-format', this.placement === 'mobile' ? 'horizontal' : 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      loadAdsense(adsenseClient);
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle ??= []).push({});
      return;
    }

    this.el.innerHTML = `${label}<a target="_blank" rel="sponsored noopener noreferrer"><img alt="" decoding="async"></a>`;
    const a = this.el.querySelector('a')!;
    a.href = house.link;
    const img = a.querySelector('img')!;
    img.src = house.image;
    img.alt = house.alt;
  }
}

function loadAdsense(client: string): void {
  if (document.querySelector(`script[src^="${ADSENSE_SRC}"]`)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `${ADSENSE_SRC}?client=${encodeURIComponent(client)}`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}
