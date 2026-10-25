import { GeoLoader } from './geo';

const topo = {
  type: 'Topology',
  objects: {
    countries: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', id: '392', arcs: [[0]], properties: { name: 'Japan' } },
        { type: 'Polygon', id: '076', arcs: [[0]], properties: { name: 'Brazil' } },
        { type: 'Polygon', id: '010', arcs: [[0]], properties: { name: 'Antarctica' } },
      ],
    },
  },
  arcs: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

function fakeFetch(calls: string[]) {
  return ((url: string) => {
    calls.push(url);
    const body = url.endsWith('world.json') ? topo : url.endsWith('abroad-cities.json') ? [{ cd: '30627' }] : { type: 'FeatureCollection', features: [] };
    return Promise.resolve(new Response(JSON.stringify(body)));
  }) as unknown as typeof fetch;
}

describe('GeoLoader', () => {
  it('decodes the world, keeps iso and drops Brazil and Antarctica', async () => {
    const world = await new GeoLoader(fakeFetch([])).world();
    expect(world.features.map((f) => f.properties?.iso)).toEqual([392]);
  });

  it('loads and caches municipalities per state', async () => {
    const calls: string[] = [];
    const geo = new GeoLoader(fakeFetch(calls));
    await geo.municipalities('BA');
    await geo.municipalities('BA');
    await geo.states();
    await geo.abroadCities();
    expect(calls).toEqual(['/geo/mun/ba.json', '/geo/states.json', '/data/abroad-cities.json']);
  });

  it('throws on HTTP errors', async () => {
    const fail = (() => Promise.resolve(new Response('x', { status: 404 }))) as unknown as typeof fetch;
    await expect(new GeoLoader(fail).states()).rejects.toThrow('404');
  });
});
