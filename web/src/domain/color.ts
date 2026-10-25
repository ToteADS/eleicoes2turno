import { clamp01 } from './tween';

/**
 * Colour mixing in OKLab (perceptual): red → blue goes through a muted purple instead of
 * the dark, muddy middle of a plain sRGB mix, and grey → red brightens evenly.
 */
type Lab = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 1, 2].map((i) => parseInt(h.slice(2 * i, 2 * i + 2), 16) / 255) as [number, number, number];
}

function hex(rgb: [number, number, number]): string {
  return '#' + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('');
}

export function toOklab(color: string): Lab {
  const [r, g, b] = parse(color).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function fromOklab([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return hex([
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toSrgb) as [number, number, number]);
}

/** `from` at t ≤ 0, `to` at t ≥ 1 (both exactly as given), the OKLab mix in between. */
export function mixColor(from: string, to: string, t: number): string {
  if (t <= 0 || from === to) return from;
  if (t >= 1) return to;
  const a = toOklab(from);
  const b = toOklab(to);
  return fromOklab([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Lab);
}
