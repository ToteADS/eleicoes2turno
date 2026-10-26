/**
 * How the second-round map is drawn. 'share' (default) cuts each area red × blue at
 * Lula's share; 'leader' paints each area whole in the colour of whoever leads it.
 */
export type MapType = 'share' | 'leader';

export interface MapOptions {
  type: MapType;
  /** a label with the % of sections totalized at the centre of each visible area */
  sectionLabels: boolean;
}

export const defaultMapOptions = (): MapOptions => ({ type: 'share', sectionLabels: false });

/** The first round is final and multi-candidate: neither option applies there. */
export const ROUND1_MAP_OPTIONS: Readonly<MapOptions> = Object.freeze(defaultMapOptions());
