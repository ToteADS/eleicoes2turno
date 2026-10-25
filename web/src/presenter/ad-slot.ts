import type { PublicConfig } from '../domain/types';
import { t } from '../i18n';

export type AdPlacement = 'results' | 'mobile';
export type HouseAd = PublicConfig['ads']['house'];

/** Partner banners shown in turn with our own when AdSense is not serving. */
export const PARTNER_ADS: HouseAd[] = [
  { image: '/ads/onlide-banner.svg', link: 'https://onlidegestao.com.br', alt: 'OnLide — consultoria em gestão, marketing e vendas' },
];

export interface AdSlotOptions {
  partners?: HouseAd[];
  rotateMs?: number;
}

const ADSENSE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

/** Ad space: AdSense when configured for this placement, otherwise our own and partner banners in turn. */
export class AdSlot {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly partners: HouseAd[];
  private readonly rotateMs: number;

  constructor(private readonly el: HTMLElement, private readonly placement: AdPlacement, opts: AdSlotOptions = {}) {
    this.partners = opts.partners ?? PARTNER_ADS;
    this.rotateMs = opts.rotateMs ?? 15_000;
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  render(config: PublicConfig): void {
    this.stop();
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
    const img = a.querySelector('img')!;
    const banners = [house, ...this.partners];
    let i = 0;
    const show = (b: HouseAd) => {
      a.href = b.link;
      img.src = b.image;
      img.alt = b.alt;
    };
    show(banners[0]);
    if (banners.length > 1) {
      this.timer = setInterval(() => show(banners[(i = (i + 1) % banners.length)]), this.rotateMs);
    }
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
