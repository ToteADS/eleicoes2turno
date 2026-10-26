/** A map label drawn on a canvas: MapLibre icons need no glyph server (the style has none). */
export interface LabelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  pixelRatio: number;
}

export const LABEL_FONT_PX = 12;
const HALO_PX = 2.5;
const INK = '#111418';

/**
 * Dark text with a white halo, readable on red, blue and grey. Drawn at the screen's
 * pixel ratio (capped at 2) in the site font. Null when there is no 2D canvas.
 */
export function renderLabelImage(text: string, ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1))): LabelImage | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = `700 ${LABEL_FONT_PX * ratio}px Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.font = font;
  const halo = HALO_PX * ratio;
  const width = Math.ceil(ctx.measureText(text).width + 2 * halo + 2 * ratio);
  const height = Math.ceil(LABEL_FONT_PX * ratio * 1.25 + 2 * halo);
  canvas.width = width;
  canvas.height = height;
  // resizing the canvas resets its state
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2 * halo;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.fillStyle = INK;
  const x = width / 2;
  const y = height / 2 + 0.5 * ratio;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data, pixelRatio: ratio };
}
