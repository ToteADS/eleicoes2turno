import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { AbroadCity } from '../domain/types';
import type { AreaCollection } from './globe';

const BRAZIL = 76;
const ANTARCTICA = 10;

/** Loads the static geometry and tables shipped with the site (web/public). */
export class GeoLoader {
  private muniCache = new Map<string, Promise<AreaCollection>>();

  constructor(private readonly fetchFn: typeof fetch = (...args) => fetch(...args)) {}

  states(): Promise<AreaCollection> {
    return this.get('/geo/states.json');
  }

  municipalities(uf: string): Promise<AreaCollection> {
    const key = uf.toLowerCase();
    let p = this.muniCache.get(key);
    if (!p) {
      p = this.get<AreaCollection>(`/geo/mun/${key}.json`);
      p.catch(() => this.muniCache.delete(key));
      this.muniCache.set(key, p);
    }
    return p;
  }

  /** World countries (Natural Earth 50m) with properties.iso; Brazil is drawn by states instead. */
  async world(): Promise<AreaCollection> {
    const topo = await this.get<Topology<{ countries: GeometryCollection }>>('/geo/world.json');
    const fc = feature(topo, topo.objects.countries) as unknown as AreaCollection;
    fc.features = fc.features
      .map((f) => ({ ...f, properties: { ...f.properties, iso: Number(f.id) } }))
      .filter((f) => f.properties.iso !== BRAZIL && f.properties.iso !== ANTARCTICA);
    return fc;
  }

  abroadCities(): Promise<AbroadCity[]> {
    return this.get('/data/abroad-cities.json');
  }

  private async get<T>(url: string): Promise<T> {
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
    return (await res.json()) as T;
  }
}
