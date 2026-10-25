import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { AbroadCity, AreaResult, Region } from '../domain/types';

export type AreaCollection = FeatureCollection<Polygon | MultiPolygon>;

/** First round: the area is painted whole in its winner's color (null = no winner, grey). */
export interface SolidFill {
  fill: string | null;
  /** electorate, sizes the abroad city dots */
  el: number;
}

/** A second-round result (split red × blue by Lula's share) or a first-round solid fill. */
export type AreaPaint = AreaResult | SolidFill;

export type GlobeView =
  | { kind: 'all' }
  | { kind: 'brazil'; region: Region | 'ALL' }
  | { kind: 'uf'; uf: string }
  | { kind: 'municipality'; uf: string; id: string }
  | { kind: 'country'; iso: number }
  | { kind: 'abroadCity'; cd: string };

export type GlobePick =
  | { kind: 'uf'; uf: string }
  | { kind: 'municipality'; id: string }
  | { kind: 'country'; iso: number }
  | { kind: 'abroadCity'; cd: string };

export type GlobeHover = GlobePick & { x: number; y: number };

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RotationController {
  readonly running: boolean;
  start(): void;
  stop(): void;
  /** Flips the state and returns the new value of `running`. */
  toggle(): boolean;
  onChange(cb: (running: boolean) => void): void;
}

export interface PaintOptions {
  /** a data update of the view on screen: tween the colours from what is drawn now */
  animate?: boolean;
}

/** What the app needs from a globe. The MapLibre adapter lives in external/. */
export interface GlobeRenderer {
  readonly rotation: RotationController;
  mount(el: HTMLElement): Promise<void>;
  setWorld(world: AreaCollection, countries: Record<string, AreaPaint>, opts?: PaintOptions): void;
  /** states: features with properties.uf (uppercase); ufs keyed lowercase like the API. */
  setStates(states: AreaCollection, ufs: Record<string, AreaPaint>, opts?: PaintOptions): void;
  setMunicipalities(uf: string | null, geo: AreaCollection | null, items: Record<string, AreaPaint>, opts?: PaintOptions): void;
  setAbroadCities(cities: AbroadCity[], items: Record<string, AreaPaint>, opts?: PaintOptions): void;
  focus(view: GlobeView): void;
  setPadding(p: Padding): void;
  onPick(cb: (pick: GlobePick) => void): void;
  onHover(cb: (hover: GlobeHover | null) => void): void;
  onUserInteract(cb: () => void): void;
  zoomIn(): void;
  zoomOut(): void;
}
