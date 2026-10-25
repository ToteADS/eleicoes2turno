import bbox from '@turf/bbox';
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { leaderSide, share, splitFeature } from '../domain/split';
import { REGION_OF } from '../domain/filters';
import type { AbroadCity } from '../domain/types';
import type { AreaCollection, AreaPaint, GlobeHover, GlobePick, GlobeRenderer, GlobeView, Padding, SolidFill } from '../infra/globe';
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
}

const RED = '#d7262d';
const BLUE = '#1f5fe0';
const GHOST = '#e3e6eb';
const HOME = '#d9dde3';
const BRAZIL_CENTER: [number, number] = [-52, -14];
const FLIGHT_MS = 2600;
const PICK_LAYERS = ['cities', 'muni-fill', 'br-fill', 'world-fill'];

// L/R = the two halves of a second-round split; W = whole area in its own color (first round)
const sideColor = ['match', ['get', 'side'], 'L', RED, 'R', BLUE, 'W', ['get', 'color'], GHOST];
const activeColor = (key: string, list: (string | number)[]) => ['case', ['in', ['get', key], ['literal', list]], sideColor, GHOST];
const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });
const fc = <G extends Polygon | MultiPolygon | Point>(features: Feature<G>[]): FeatureCollection<G> => ({ type: 'FeatureCollection', features });
type Area = Feature<Polygon | MultiPolygon>;

const isSolid = (p: AreaPaint | undefined): p is SolidFill => p !== undefined && 'fill' in p;
const solidProps = (p: SolidFill) => (p.fill ? { side: 'W', color: p.fill } : { side: 'X' });

/** Cuts the area red × blue (second round) or keeps it whole in the winner's color (first round). */
function paintArea(f: Area, paint: AreaPaint | undefined, props: Record<string, unknown>): Area[] {
  if (isSolid(paint)) return [{ ...f, properties: { ...props, ...solidProps(paint) } }];
  return splitFeature(f, share(paint), props);
}

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

  constructor(private readonly createMap: (el: HTMLElement) => MapLike) {}

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

  setWorld(world: AreaCollection, countries: Record<string, AreaPaint>): void {
    const parts: Area[] = [];
    this.world.clear();
    this.worldShapes.clear();
    for (const f of world.features) {
      const iso = Number(f.properties?.iso);
      this.world.set(iso, f);
      this.worldShapes.add(iso);
      const r = countries[String(iso)];
      if (isSolid(r)) {
        parts.push({ ...f, properties: { iso, ...solidProps(r) } });
        continue;
      }
      const s = share(r);
      if (s === null) {
        parts.push({ ...f, properties: { iso, side: 'X' } });
        continue;
      }
      const pieces = polygons(f).sort((a, b) => bboxArea(b) - bboxArea(a));
      const [minX, , maxX] = bbox(pieces[0]);
      if (maxX - minX > 180) {
        // crosses the antimeridian (Russia, Fiji): a split would smear around the globe
        parts.push({ ...f, properties: { iso, side: leaderSide(r) } });
        continue;
      }
      parts.push(...splitFeature(pieces[0], s, { iso }));
      // overseas pieces (Alaska, French Guiana…) take the leader's color
      for (const p of pieces.slice(1)) parts.push({ ...p, properties: { iso, side: leaderSide(r) } });
    }
    this.setData('world', fc(parts));
  }

  setStates(states: AreaCollection, ufs: Record<string, AreaPaint>): void {
    this.states.clear();
    const parts: Area[] = [];
    for (const f of states.features) {
      const uf = String(f.properties?.uf);
      this.states.set(uf, f);
      parts.push(...paintArea(f, ufs[uf.toLowerCase()], { uf }));
    }
    this.setData('br', fc(parts));
    this.setData('brline', states);
  }

  setMunicipalities(uf: string | null, geo: AreaCollection | null, items: Record<string, AreaPaint>): void {
    this.munis.clear();
    if (!uf || !geo) {
      this.setData('muni', empty());
      this.setData('muniline', empty());
      return;
    }
    const parts: Area[] = [];
    for (const f of geo.features) {
      const id = String(f.properties?.id);
      this.munis.set(id, f);
      parts.push(...paintArea(f, items[id], { id }));
    }
    this.setData('muni', fc(parts));
    this.setData('muniline', geo);
  }

  setAbroadCities(cities: AbroadCity[], items: Record<string, AreaPaint>): void {
    this.cities = new Map(cities.map((c) => [c.cd, c]));
    this.setData('cities', fc(cities.map((c) => {
      const r = items[c.cd];
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
        properties: { cd: c.cd, iso: c.iso, el: r?.el ?? 0, ...(isSolid(r) ? solidProps(r) : { side: leaderSide(r) }) },
      };
    })));
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
        this.paint(sideColor, sideColor);
        this.citiesFilter(['!', ['in', ['get', 'iso'], ['literal', [...this.worldShapes]]]]);
        this.setData('sel', empty());
        this.spinAfterFlight = true;
        this.map.flyTo({ center: BRAZIL_CENTER, zoom: window.innerWidth < 640 ? 1.2 : 1.8, padding: this.padding, duration: FLIGHT_MS, essential: true });
        return;
      }
      case 'brazil': {
        const ufs = [...this.states.keys()].filter((uf) => view.region === 'ALL' || REGION_OF[uf] === view.region);
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
        this.map.setPaintProperty('muni-fill', 'fill-color', muni ? activeColor('id', [view.kind === 'municipality' ? view.id : '']) : sideColor);
        const target = muni ?? state;
        this.setData('sel', target ?? empty());
        if (target) this.fit([target], muni ? 11 : 8);
        return;
      }
      case 'country': {
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
    for (const id of ['world', 'br', 'brline', 'muni', 'muniline', 'cities', 'sel', 'hover']) {
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
    ];
    layers.forEach((l) => this.map.addLayer(l));
  }
}
