import { t } from '../i18n';

const PORTFOLIO = 'https://aristoteles.tapp.solutions';
const AVATAR = '/brand/aristoteles.webp';

/** "Made by" card under the ad, linking to the author's portfolio. */
export class CreatorCredit {
  constructor(private readonly el: HTMLElement) {}

  render(): void {
    this.el.innerHTML = `
      <a class="creator" href="${PORTFOLIO}" target="_blank" rel="noopener">
        <img src="${AVATAR}" alt="" width="36" height="36" decoding="async" loading="lazy">
        <span class="creator-who"><small>${t('credit_by')}</small><b>Aristóteles Araújo</b></span>
        <em>${t('credit_portfolio')}</em>
      </a>`;
  }
}
