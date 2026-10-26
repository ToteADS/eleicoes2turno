import bbox from '@turf/bbox';
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { splitFeature } from '../domain/split';
import { REGION_OF } from '../domain/filters';
import { sectionsLabel } from '../domain/format';
import { labelPoint } from '../domain/label-point';
import { defaultMapOptions, type MapOptions } from '../domain/map-options';
import type { AbroadCity } from '../domain/types';
import { getLocale } from '../i18n';
import { browserClock, tween, type FrameClock, type Tween } from '../infra/animation';
import type { AreaCollection, AreaPaint, GlobeHover, GlobePick, GlobeRenderer, GlobeView, Padding, PaintOptions, SolidFill } from '../infra/globe';
import { BLUE, colorProps, GHOST, leadProps, lookOf, mixLook, RED, sameLook, type AreaLook } from './area-look';
import { renderLabelImage, type LabelImage } from './label-image';
import { IdleRotation } from './rotation';

/** The slice of the MapLibre Map API this adapter uses (keeps the library swappable and testable). */
export interface MapLike {
  on(event: string, layerOrCb: unknown, cb?: unknown): unknown;
  once(event: string, cb: () => void): unknown;
  addSource(id: string, source: Record<string, unknown>): unknown;
  getSource(id: string): { setData(data: unknown): unknown } | undefined;
  addLayer(layer: Record<string, unknown>): unknown;
  setPaintProperty(layer: string, prop: string, value: unknown): unknown;
  setLayoutProperty(layer: string, prop: string, value: unknown): unknown;
  setFilter(layer: string, filter: unknown): unknown;
  fitBounds(bounds: [[number, number], [number, number]], options: Record<string, unknown>): unknown;
  flyTo(options: Record<string, unknown>): unknown;
  easeTo(options: Record<string, unknown>): unknown;
  stop(): unknown;
  zoomIn(options?: Record<string, unknown>): unknown;
  zoomOut(options?: Record<string, unknown>): unknown;
  getCenter(): { lng: number; lat: number };
  getCanvas(): HTMLCanvasElement;
  queryRenderedFeatures(point: unknown, options: Record<string, unknown>): unknown[];
  addImage(id: string, image: { width: number; height: number; data: Uint8ClampedArray }, options: Record<string, unknown>): unknown;
  hasImage(id: string): boolean;
  setMissingStyleImageResolver(resolver: ((id: string) => void) | null): unknown;
}

const HOME = '#d9dde3';
const BRAZIL_CENTER: [number, number] = [-52, -14];
const FLIGHT_MS = 2600;
const PICK_LAYERS = ['cities', 'muni-fill', 'br-fill', 'world-fill'];

/** Colour tween of a live update. MapLibre does not transition data-driven colours, so we redraw. */
export const GLOBE_TWEEN_MS = 700;
/** a redraw costing more than this (ms, main thread) ends the tween at once: phones first */
export const MAX_FRAME_MS = 24;
/** more changed areas than this skip the tween (thousands of redraw-heavy pieces) */
export const MAX_TWEEN_AREAS = 1200;
/** ms between redraws: ~30 fps for cheap redraws, fewer for costly ones */
export const frameInterval = (cost: number): number => Math.min(160, Math.max(33, cost * 4));

// L/R = the two halves of a second-round split; W = whole area in its own color (first round)
const sideColor = ['match', ['get', 'side'], 'L', RED, 'R', BLUE, 'W', ['get', 'color'], GHOST];
const activeColor = (key: string, list: (string | number)[]) => ['case', ['in', ['get', key], ['literal', list]], sideColor, GHOST];
const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });
const fc = <G extends Polygon | MultiPolygon | Point>(features: Feature<G>[]): FeatureCollection<G> => ({ type: 'FeatureCollection', features });
type Area = Feature<Polygon | MultiPolygon>;

/** the label icons are named after their text: one image per distinct label, made on demand */
const LABEL_IMAGE = 'pct:';
type LabelKind = 'world' | 'br' | 'muni' | 'city';
const kindIs = (kind: LabelKind) => ['==', ['get', 'kind'], kind];

const isSolid = (p: unknown): p is SolidFill => p !== undefined && p !== null && typeof p === 'object' && 'fill' in p;
const solidProps = (p: SolidFill) => (p.fill ? { side: 'W', color: p.fill } : { side: 'X' });

/** What one area is drawn with: a first-round solid fill, or a second-round red × blue look. */
type Look = SolidFill | AreaLook;

/** Cuts the area at the look's share; the west part in its west colour, the east in its east colour. */
function lookPieces(f: Area, look: AreaLook, props: Record<string, unknown>): Area[] {
  if (look.share === null) return [{ ...f, properties: { ...props, ...leadProps(look) } }];
  return splitFeature(f, look.share, props).map((p) => {
    const side = p.properties?.side === 'L' ? 'L' : 'R';
    return { ...p, properties: { ...p.properties, ...colorProps(side === 'L' ? look.west : look.east, side) } };
  });
}

/** Cuts the area red × blue (second round) or keeps it whole in the winner's color (first round). */
function paintArea(f: Area, look: Look, props: Record<string, unknown>): Area[] {
  if (isSolid(look)) return [{ ...f, properties: { ...props, ...solidProps(look) } }];
  return lookPieces(f, look, props);
}

type SourceId = 'world' | 'br' | 'muni' | 'cities';

/** What a source shows now (one look per area of `of`), the pieces cut for each, and its running tween. */
interface Drawn {
  of?: object;
  shown: Look[];
  pieces: { look: Look; parts: Feature[] }[];
  tween?: Tween;
}
const drawn = (): Drawn => ({ shown: [], pieces: [] });

function polygons(f: Area): Area[] {
  const g = f.geometry;
  const list = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  return list.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }));
}

function bboxArea(f: Area): number {
  const [x0, y0, x1, y1] = bbox(f);
  return (x1 - x0) * (y1 - y0);
}

function bounds(features: Feature[]): [[number, number], [number, number]] {
  const [x0, y0, x1, y1] = bbox(fc(features as Feature<Polygon>[]));
  return [[x0, y0], [x1, y1]];
}

interface RenderedFeature {
  layer: { id: string };
  properties: Record<string, unknown>;
}

/** GlobeRenderer on top of MapLibre GL (globe projection). */
export class MapLibreGlobe implements GlobeRenderer {
  rotation!: IdleRotation;
  private map!: MapLike;
  private padding: Padding = { top: 40, right: 40, bottom: 40, left: 40 };
  private states = new Map<string, Area>();
  private world = new Map<number, Area>();
  private worldShapes = new Set<number>();
  private munis = new Map<string, Area>();
  private cities = new Map<string, AbroadCity>();
  private pickCbs: ((p: GlobePick) => void)[] = [];
  private hoverCbs: ((h: GlobeHover | null) => void)[] = [];
  private interactCbs: (() => void)[] = [];
  private spinAfterFlight = false;
  private selectedUf: string | null = null;
  private drawn: Record<SourceId, Drawn> = { world: drawn(), br: drawn(), muni: drawn(), cities: drawn() };
  private worldParts = new WeakMap<Area, { pieces: Area[]; crosses: boolean }>();
  /** main-thread cost (ms) of the last tween redraws, for the performance check */
  readonly frameCosts: number[] = [];
  private options: MapOptions = defaultMapOptions();
  /** per kind, what its label points are made of (the last set* call), built only while labels are on */
  private labelInputs: Partial<Record<LabelKind, () => Feature<Point>[]>> = {};
  private labelPoints = new WeakMap<object, { at: [number, number]; rank: number }>();
  private labelsQueued = false;

  constructor(
    private readonly createMap: (el: HTMLElement) => MapLike,
    private readonly clock: FrameClock = browserClock,
    private readonly labelImage: (text: string) => LabelImage | null = renderLabelImage,
  ) {}

  async mount(el: HTMLElement): Promise<void> {
    this.map = this.createMap(el);
    this.rotation = new IdleRotation(this.map, () => this.padding);
    await new Promise<void>((resolve) => this.map.once('load', resolve));
    this.addLayers();
    this.wireEvents();
  }

  setPadding(p: Padding): void {
    this.padding = p;
  }

  setMapOptions(o: MapOptions): void {
    const labelsChanged = o.sectionLabels !== this.options.sectionLabels;
    this.options = { ...o };
    if (!labelsChanged) return;
    this.map.setLayoutProperty('labels', 'visibility', o.sectionLabels ? 'visible' : 'none');
    if (o.sectionLabels) this.queueLabels();
    else this.setData('labels', empty());
  }

  private toLook(p: AreaPaint | undefined): Look {
    return isSolid(p) ? p : lookOf(p, this.options.type);
  }

  /**
   * Records how to build one kind's labels (text = % of sections totalized) and rebuilds
   * the label source once per task, so a poll that repaints every layer sets it once.
   */
  private labels(kind: LabelKind, build: (() => Feature<Point>[]) | null): void {
    if (build) this.labelInputs[kind] = build;
    else delete this.labelInputs[kind];
    if (this.options.sectionLabels) this.queueLabels();
  }

  private queueLabels(): void {
    if (this.labelsQueued) return;
    this.labelsQueued = true;
    queueMicrotask(() => {
      this.labelsQueued = false;
      if (!this.options.sectionLabels) return;
      this.setData('labels', fc(Object.values(this.labelInputs).flatMap((build) => build())));
    });
  }

  /** Label points of `areas` with a result; bigger areas win label collisions (lower sort key). */
  private areaLabels(kind: LabelKind, areas: Area[], key: (i: number) => string | number, item: (i: number) => AreaPaint | undefined): () => Feature<Point>[] {
    return () => {
      const locale = getLocale();
      return areas.flatMap((f, i): Feature<Point>[] => {
        const r = item(i);
        const text = isSolid(r) ? null : sectionsLabel(r, locale);
        if (!text) return [];
        // computed once per shape (pole of inaccessibility), on the first time it gets a label
        let p = this.labelPoints.get(f);
        if (!p) {
          p = { at: labelPoint(f), rank: -bboxArea(f) };
          this.labelPoints.set(f, p);
        }
        return [{ type: 'Feature', geometry: { type: 'Point', coordinates: p.at }, properties: { kind, key: key(i), img: LABEL_IMAGE + text, rank: p.rank } }];
      });
    };
  }

  setWorld(world: AreaCollection, countries: Record<string, AreaPaint>, opts: PaintOptions = {}): void {
    this.world.clear();
    this.worldShapes.clear();
    const isos = world.features.map((f) => Number(f.properties?.iso));
    world.features.forEach((f, i) => {
      this.world.set(isos[i], f);
      this.worldShapes.add(isos[i]);
    });
    this.draw('world', world, world.features.length, (i) => this.toLook(countries[String(isos[i])]), (i, look) => this.countryPieces(world.features[i], isos[i], look), opts);
    this.labels('world', this.areaLabels('world', world.features, (i) => isos[i], (i) => countries[String(isos[i])]));
  }

  setStates(states: AreaCollection, ufs: Record<string, AreaPaint>, opts: PaintOptions = {}): void {
    this.states.clear();
    const list = states.features.map((f) => String(f.properties?.uf));
    states.features.forEach((f, i) => this.states.set(list[i], f));
    this.draw('br', states, list.length, (i) => this.toLook(ufs[list[i].toLowerCase()]), (i, look) => paintArea(states.features[i], look, { uf: list[i] }), opts);
    this.setData('brline', states);
    this.labels('br', this.areaLabels('br', states.features, (i) => list[i], (i) => ufs[list[i].toLowerCase()]));
  }

  setMunicipalities(uf: string | null, geo: AreaCollection | null, items: Record<string, AreaPaint>, opts: PaintOptions = {}): void {
    this.munis.clear();
    if (!uf || !geo) {
      this.reset('muni');
      this.setData('muni', empty());
      this.setData('muniline', empty());
      this.labels('muni', null);
      return;
    }
    const ids = geo.features.map((f) => String(f.properties?.id));
    geo.features.forEach((f, i) => this.munis.set(ids[i], f));
    this.draw('muni', geo, ids.length, (i) => this.toLook(items[ids[i]]), (i, look) => paintArea(geo.features[i], look, { id: ids[i] }), opts);
    this.setData('muniline', geo);
    this.labels('muni', this.areaLabels('muni', geo.features, (i) => ids[i], (i) => items[ids[i]]));
  }

  setAbroadCities(cities: AbroadCity[], items: Record<string, AreaPaint>, opts: PaintOptions = {}): void {
    this.cities = new Map(cities.map((c) => [c.cd, c]));
    this.draw('cities', cities, cities.length, (i) => this.toLook(items[cities[i].cd]), (i, look) => {
      const c = cities[i];
      return [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
        properties: { cd: c.cd, iso: c.iso, el: items[c.cd]?.el ?? 0, ...(isSolid(look) ? solidProps(look) : leadProps(look)) },
      }];
    }, opts);
    this.labels('city', () => {
      const locale = getLocale();
      return cities.flatMap((c): Feature<Point>[] => {
        const r = items[c.cd];
        const text = r && !isSolid(r) ? sectionsLabel(r, locale) : null;
        if (!text) return [];
        // the biggest electorates win collisions
        return [{ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { kind: 'city', key: c.cd, iso: c.iso, img: LABEL_IMAGE + text, rank: -r.el } }];
      });
    });
  }

  /** Overseas pieces (Alaska, French Guiana…) and countries across the antimeridian take the leader's colour. */
  private countryPieces(f: Area, iso: number, look: Look): Feature[] {
    if (isSolid(look)) return [{ ...f, properties: { iso, ...solidProps(look) } }];
    if (look.share === null) return [{ ...f, properties: { iso, ...leadProps(look) } }];
    let geo = this.worldParts.get(f);
    if (!geo) {
      const pieces = polygons(f).sort((a, b) => bboxArea(b) - bboxArea(a));
      const [minX, , maxX] = bbox(pieces[0]);
      geo = { pieces, crosses: maxX - minX > 180 };
      this.worldParts.set(f, geo);
    }
    // crosses the antimeridian (Russia, Fiji): a split would smear around the globe
    if (geo.crosses) return [{ ...f, properties: { iso, ...leadProps(look) } }];
    return [...lookPieces(geo.pieces[0], look, { iso }), ...geo.pieces.slice(1).map((p) => ({ ...p, properties: { iso, ...leadProps(look) } }))];
  }

  /** Forgets what a source shows (another state, no state): nothing to tween from. */
  private reset(id: SourceId): void {
    this.drawn[id].tween?.cancel();
    this.drawn[id] = drawn();
  }

  /**
   * Draws the `count` areas of one source (`of` is their geometry). With `animate`, areas
   * whose look changed tween from what is on screen to the new look (redrawing the source,
   * throttled by what a redraw costs); everything else, and every call without `animate`,
   * is drawn at once. Unchanged areas reuse the pieces already cut.
   */
  private draw(id: SourceId, of: object, count: number, target: (i: number) => Look, build: (i: number, look: Look) => Feature[], opts: PaintOptions): void {
    if (this.drawn[id].of !== of) {
      this.reset(id);
      this.drawn[id].of = of;
    }
    const d = this.drawn[id];
    d.tween?.cancel();
    d.tween = undefined;
    const from = d.shown;
    const to = Array.from({ length: count }, (_, i) => target(i));
    const paint = (looks: Look[]) => {
      d.shown = looks;
      const parts: Feature[] = [];
      d.pieces = looks.map((look, i) => {
        const cached = d.pieces[i];
        const entry = cached && (cached.look === look || (!isSolid(look) && !isSolid(cached.look) && sameLook(cached.look, look)))
          ? cached : { look, parts: build(i, look) };
        parts.push(...entry.parts);
        return entry;
      });
      this.setData(id, fc(parts as Area[]));
    };
    const changed = opts.animate && from.length === count
      ? to.flatMap((b, i) => (!isSolid(from[i]) && !isSolid(b) && !sameLook(from[i] as AreaLook, b) ? [i] : []))
      : [];
    if (!changed.length || changed.length > MAX_TWEEN_AREAS) return paint(to);
    let cost = 0;
    d.tween = tween({
      duration: GLOBE_TWEEN_MS,
      clock: this.clock,
      minInterval: () => frameInterval(cost),
      frame: (e) => {
        const t0 = this.clock.now();
        const looks = [...to];
        for (const i of changed) looks[i] = mixLook(from[i] as AreaLook, to[i] as AreaLook, e);
        paint(looks);
        cost = this.clock.now() - t0;
        this.frameCosts.push(cost);
        if (this.frameCosts.length > 200) this.frameCosts.shift();
        if (cost > MAX_FRAME_MS && e < 1) d.tween?.finish();
      },
    });
  }

  focus(view: GlobeView): void {
    this.rotation.stop();
    this.spinAfterFlight = false;
    this.setData('hover', empty());
    const abroad = view.kind === 'all' || view.kind === 'country' || view.kind === 'abroadCity';
    for (const layer of ['cities', 'cities-halo']) this.map.setLayoutProperty(layer, 'visibility', abroad ? 'visible' : 'none');
    this.selectedUf = view.kind === 'uf' || view.kind === 'municipality' ? view.uf : null;

    switch (view.kind) {
      case 'all': {
        this.labelFilter(['in', ['get', 'kind'], ['literal', ['world', 'br']]]);
        this.paint(sideColor, sideColor);
        this.citiesFilter(['!', ['in', ['get', 'iso'], ['literal', [...this.worldShapes]]]]);
        this.setData('sel', empty());
        this.spinAfterFlight = true;
        this.map.flyTo({ center: BRAZIL_CENTER, zoom: window.innerWidth < 640 ? 1.2 : 1.8, padding: this.padding, duration: FLIGHT_MS, essential: true });
        return;
      }
      case 'brazil': {
        const ufs = [...this.states.keys()].filter((uf) => view.region === 'ALL' || REGION_OF[uf] === view.region);
        this.labelFilter(view.region === 'ALL' ? kindIs('br') : ['all', kindIs('br'), ['in', ['get', 'key'], ['literal', ufs]]]);
        this.paint(view.region === 'ALL' ? sideColor : activeColor('uf', ufs), ['case', ['==', ['get', 'side'], 'X'], GHOST, HOME]);
        this.setData('sel', empty());
        this.fit(ufs.map((uf) => this.states.get(uf)!).filter(Boolean), 6);
        return;
      }
      case 'uf':
      case 'municipality': {
        const state = this.states.get(view.uf);
        this.paint(['case', ['==', ['get', 'uf'], view.uf], 'rgba(0,0,0,0)', GHOST], ['case', ['==', ['get', 'side'], 'X'], GHOST, HOME]);
        const muni = view.kind === 'municipality' ? this.munis.get(view.id) : undefined;
        this.labelFilter(view.kind === 'municipality' ? ['all', kindIs('muni'), ['==', ['get', 'key'], view.id]] : kindIs('muni'));
        this.map.setPaintProperty('muni-fill', 'fill-color', muni ? activeColor('id', [view.kind === 'municipality' ? view.id : '']) : sideColor);
        const target = muni ?? state;
        this.setData('sel', target ?? empty());
        if (target) this.fit([target], muni ? 11 : 8);
        return;
      }
      case 'country': {
        this.labelFilter(['all', kindIs('city'), ['==', ['get', 'iso'], view.iso]]);
        this.paint(HOME, activeColor('iso', [view.iso]));
        this.citiesFilter(['==', ['get', 'iso'], view.iso]);
        const shape = this.world.get(view.iso);
        this.setData('sel', shape ?? empty());
        const pts = [...this.cities.values()].filter((c) => c.iso === view.iso)
          .map((c): Feature<Point> => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } }));
        const main = shape ? polygons(shape).sort((a, b) => bboxArea(b) - bboxArea(a))[0] : undefined;
        const targets: Feature[] = [...pts, ...(main ? [main] : [])];
        if (targets.length) this.fit(targets, !main && pts.length === 1 ? 8 : 6.5);
        return;
      }
      case 'abroadCity': {
        const c = this.cities.get(view.cd);
        if (!c) return;
        this.labelFilter(['all', kindIs('city'), ['==', ['get', 'iso'], c.iso]]);
        this.paint(HOME, activeColor('iso', [c.iso]));
        this.citiesFilter(['==', ['get', 'iso'], c.iso]);
        this.setData('sel', empty());
        this.map.flyTo({ center: [c.lon, c.lat], zoom: 8, padding: this.padding, duration: FLIGHT_MS, essential: true });
      }
    }
  }

  onPick(cb: (pick: GlobePick) => void): void {
    this.pickCbs.push(cb);
  }

  onHover(cb: (hover: GlobeHover | null) => void): void {
    this.hoverCbs.push(cb);
  }

  onUserInteract(cb: () => void): void {
    this.interactCbs.push(cb);
  }

  zoomIn(): void {
    this.rotation.stop();
    this.map.zoomIn({ duration: 300 });
  }

  zoomOut(): void {
    this.rotation.stop();
    this.map.zoomOut({ duration: 300 });
  }

  private paint(brFill: unknown, worldFill: unknown): void {
    this.map.setPaintProperty('br-fill', 'fill-color', brFill);
    this.map.setPaintProperty('world-fill', 'fill-color', worldFill);
  }

  private labelFilter(filter: unknown): void {
    this.map.setFilter('labels', filter);
  }

  private citiesFilter(filter: unknown): void {
    for (const layer of ['cities', 'cities-halo']) this.map.setFilter(layer, filter);
  }

  private fit(features: Feature[], maxZoom: number): void {
    if (!features.length) return;
    const b = bounds(features);
    const p = this.padding;
    if (p.bottom <= p.top) {
      this.map.fitBounds(b, { padding: p, maxZoom, duration: FLIGHT_MS, essential: true });
      return;
    }
    // Bottom dock (phones, portrait tablets): on the globe, fitBounds either refuses
    // ("cannot fit") or lands off-centre with a bottom-heavy padding, so compute the
    // camera ourselves (mercator scale of the bounds) and fly there.
    const [[x0, y0], [x1, y1]] = b;
    const canvas = this.map.getCanvas();
    const w = Math.max(1, canvas.clientWidth - p.left - p.right);
    const h = Math.max(1, canvas.clientHeight - p.top - p.bottom);
    const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const zx = Math.log2((w * 360) / (512 * Math.max(x1 - x0, 1e-6)));
    const zy = Math.log2((h * 2 * Math.PI) / (512 * Math.max(merc(y1) - merc(y0), 1e-6)));
    const lat = (Math.atan(Math.sinh((merc(y0) + merc(y1)) / 2)) * 180) / Math.PI;
    this.map.flyTo({ center: [(x0 + x1) / 2, lat], zoom: Math.min(maxZoom, zx, zy), padding: p, duration: FLIGHT_MS, essential: true });
  }

  private setData(id: string, data: unknown): void {
    this.map.getSource(id)?.setData(data);
  }

  private pickAt(point: unknown): { pick: GlobePick; shape?: Area } | null {
    const hits = this.map.queryRenderedFeatures(point, { layers: PICK_LAYERS }) as RenderedFeature[];
    for (const f of hits) {
      const p = f.properties;
      switch (f.layer.id) {
        case 'cities':
          return { pick: { kind: 'abroadCity', cd: String(p.cd) } };
        case 'muni-fill':
          return { pick: { kind: 'municipality', id: String(p.id) }, shape: this.munis.get(String(p.id)) };
        case 'br-fill':
          if (p.uf === this.selectedUf) continue;
          return { pick: { kind: 'uf', uf: String(p.uf) }, shape: this.states.get(String(p.uf)) };
        case 'world-fill':
          if (p.side === 'X') continue;
          return { pick: { kind: 'country', iso: Number(p.iso) }, shape: this.world.get(Number(p.iso)) };
      }
    }
    return null;
  }

  private wireEvents(): void {
    // label icons are drawn the first time a text is needed (one per distinct text)
    this.map.setMissingStyleImageResolver((id: string) => {
      if (!id.startsWith(LABEL_IMAGE) || this.map.hasImage(id)) return;
      const img = this.labelImage(id.slice(LABEL_IMAGE.length));
      if (img) this.map.addImage(id, img, { pixelRatio: img.pixelRatio });
    });
    this.map.on('moveend', () => {
      if (this.spinAfterFlight) {
        this.spinAfterFlight = false;
        this.rotation.start();
      }
    });
    const interact = () => {
      this.spinAfterFlight = false;
      this.rotation.stop();
      this.interactCbs.forEach((cb) => cb());
    };
    const canvas = this.map.getCanvas();
    for (const ev of ['pointerdown', 'wheel', 'touchstart']) canvas.addEventListener(ev, interact, { passive: true });

    this.map.on('click', (e: { point: unknown }) => {
      const hit = this.pickAt(e.point);
      if (hit) this.pickCbs.forEach((cb) => cb(hit.pick));
    });
    this.map.on('mousemove', (e: { point: { x: number; y: number } }) => {
      const hit = this.pickAt(e.point);
      canvas.style.cursor = hit ? 'pointer' : '';
      this.setData('hover', hit?.shape ?? empty());
      this.hoverCbs.forEach((cb) => cb(hit ? { ...hit.pick, x: e.point.x, y: e.point.y } : null));
    });
    canvas.addEventListener('mouseleave', () => {
      this.setData('hover', empty());
      this.hoverCbs.forEach((cb) => cb(null));
    });
  }

  private addLayers(): void {
    for (const id of ['world', 'br', 'brline', 'muni', 'muniline', 'cities', 'sel', 'hover', 'labels']) {
      this.map.addSource(id, { type: 'geojson', data: empty() });
    }
    const radius = ['+', 3, ['/', ['sqrt', ['get', 'el']], 22]];
    const layers: Record<string, unknown>[] = [
      { id: 'world-fill', type: 'fill', source: 'world', paint: { 'fill-color': sideColor, 'fill-antialias': false } },
      { id: 'world-line', type: 'line', source: 'world', filter: ['==', ['get', 'side'], 'X'], paint: { 'line-color': '#ffffff', 'line-width': 0.6 } },
      { id: 'br-fill', type: 'fill', source: 'br', paint: { 'fill-color': sideColor, 'fill-antialias': false } },
      { id: 'br-line', type: 'line', source: 'brline', paint: { 'line-color': '#ffffff', 'line-width': 1 } },
      { id: 'muni-fill', type: 'fill', source: 'muni', paint: { 'fill-color': sideColor, 'fill-antialias': false } },
      { id: 'muni-line', type: 'line', source: 'muniline', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.2, 9, 1] } },
      {
        id: 'cities-halo', type: 'circle', source: 'cities',
        paint: {
          'circle-color': '#111418', 'circle-opacity': 0.3, 'circle-blur': 0.4,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['+', 2, ['*', 0.5, radius]], 6, ['+', 4, ['*', 1.6, radius]]],
        },
      },
      {
        id: 'cities', type: 'circle', source: 'cities',
        paint: {
          'circle-color': ['match', ['get', 'side'], 'L', RED, 'R', BLUE, 'W', ['get', 'color'], '#9aa1ad'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['*', 0.5, radius], 6, ['*', 1.6, radius]],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5,
        },
      },
      { id: 'hover-line', type: 'line', source: 'hover', paint: { 'line-color': '#111418', 'line-width': 1.6 } },
      { id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': '#111418', 'line-width': 2 } },
      {
        // % of sections totalized; off by default. MapLibre drops labels that would collide,
        // keeping the biggest areas first (symbol-sort-key = minus the area's size).
        id: 'labels', type: 'symbol', source: 'labels',
        layout: {
          visibility: 'none',
          'icon-image': ['get', 'img'],
          'icon-padding': 3,
          'symbol-sort-key': ['get', 'rank'],
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
        },
      },
    ];
    layers.forEach((l) => this.map.addLayer(l));
  }
}
