import type { GlobeRenderer } from '../infra/globe';
import { t } from '../i18n';

const icon = (path: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const ICONS = {
  pause: icon('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  play: icon('<path d="M7 5l12 7-12 7z"/>'),
  reset: icon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  minus: icon('<path d="M5 12h14"/>'),
  full: icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
};

/** Floating globe controls: spin/pause, back to start, zoom in/out, fullscreen. */
export class GlobeControls {
  constructor(el: HTMLElement, globe: GlobeRenderer, onReset: () => void) {
    const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';
    el.innerHTML = `
      <button type="button" data-act="spin"></button>
      <button type="button" data-act="reset" aria-label="${t('globe_reset')}" title="${t('globe_reset')}">${ICONS.reset}</button>
      <button type="button" data-act="in" aria-label="${t('globe_zoom_in')}" title="${t('globe_zoom_in')}">${ICONS.plus}</button>
      <button type="button" data-act="out" aria-label="${t('globe_zoom_out')}" title="${t('globe_zoom_out')}">${ICONS.minus}</button>
      ${canFullscreen ? `<button type="button" data-act="full" aria-label="${t('globe_fullscreen')}" title="${t('globe_fullscreen')}">${ICONS.full}</button>` : ''}`;

    const spin = el.querySelector<HTMLButtonElement>('[data-act="spin"]')!;
    const paintSpin = (running: boolean) => {
      const label = running ? t('globe_pause') : t('globe_play');
      spin.innerHTML = running ? ICONS.pause : ICONS.play;
      spin.setAttribute('aria-label', label);
      spin.title = label;
      spin.setAttribute('aria-pressed', String(running));
    };
    paintSpin(globe.rotation.running);
    globe.rotation.onChange(paintSpin);

    el.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'spin') globe.rotation.toggle();
      if (act === 'reset') onReset();
      if (act === 'in') globe.zoomIn();
      if (act === 'out') globe.zoomOut();
      if (act === 'full') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
    });
  }
}
