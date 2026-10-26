import { mixColor } from '../domain/color';
import { leaderSide, share } from '../domain/split';
import { lerp } from '../domain/tween';
import type { MapType } from '../domain/map-options';
import type { AreaResult } from '../domain/types';

export const RED = '#d7262d';
export const BLUE = '#1f5fe0';
export const GHOST = '#e3e6eb';
/** "Mais votos": an exact tie (votes, no leader). Darker than GHOST so it does not read as "no data". */
export const TIE = '#a7adb8';

/**
 * How a second-round area is drawn: where the red × blue line sits (null = no split,
 * the area is whole) and the colours of the west part, the east part and of the
 * pieces painted whole in the leader's colour (overseas pieces, abroad city dots).
 * At rest the colours are exactly RED / BLUE / GHOST; mid-tween they are in between.
 */
export interface AreaLook {
  share: number | null;
  west: string;
  east: string;
  lead: string;
}

const LEAD = { L: RED, R: BLUE, X: GHOST } as const;

/**
 * 'share': the red × blue split. 'leader' ("Mais votos"): no split, the whole area in the
 * leader's colour (TIE on an exact tie), so a leader change tweens the colour in OKLab.
 */
export function lookOf(r: AreaResult | undefined, type: MapType = 'share'): AreaLook {
  const s = share(r);
  if (s === null) return { share: null, west: GHOST, east: GHOST, lead: GHOST };
  if (type === 'leader') {
    const side = leaderSide(r);
    const c = side === 'X' ? TIE : LEAD[side];
    return { share: null, west: c, east: c, lead: c };
  }
  return { share: s, west: RED, east: BLUE, lead: LEAD[leaderSide(r)] };
}

export const sameLook = (a: AreaLook, b: AreaLook): boolean =>
  a.share === b.share && a.west === b.west && a.east === b.east && a.lead === b.lead;

/**
 * The look `t` (0..1) of the way from `a` to `b`: the line slides from one share to the
 * other and the colours blend in OKLab. An area that gains its first numbers keeps the
 * new line and fades in from grey; one that loses them fades out where it was.
 */
export function mixLook(a: AreaLook, b: AreaLook, t: number): AreaLook {
  if (t >= 1) return b;
  const at = a.share === null ? b.share : b.share === null ? a.share : lerp(a.share, b.share, t);
  return { share: at, west: mixColor(a.west, b.west, t), east: mixColor(a.east, b.east, t), lead: mixColor(a.lead, b.lead, t) };
}

/** Feature properties for a piece in `color`: the shared L/R/X sides at rest, or an explicit colour. */
export function colorProps(color: string, side: 'L' | 'R' | 'X'): Record<string, unknown> {
  return color === LEAD[side] ? { side } : { side: 'W', color };
}

/** A piece painted whole in the leader's colour. */
export function leadProps(look: AreaLook): Record<string, unknown> {
  if (look.lead === RED) return { side: 'L' };
  if (look.lead === BLUE) return { side: 'R' };
  if (look.lead === GHOST) return { side: 'X' };
  return { side: 'W', color: look.lead };
}
