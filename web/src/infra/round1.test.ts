import { decodeArea, Round1Loader } from './round1';

const area = [100, 80, 20, 70, 6, 4, 10, 10, 40, 30];
const summary = {
  dg: '05/10/2026', hg: '12:51:47',
  candidates: [{ n: 22, name: 'Flávio Bolsonaro', party: 'PL', sqcand: '1', runoff: true }, { n: 13, name: 'Lula', party: 'PT', sqcand: '2', runoff: true }],
  br: area, brUfsSum: area, zz: area, ufs: { ba: area }, countries: { '392': area },
};

function fakeFetch(calls: string[], status = 200) {
  return ((url: string) => {
    calls.push(url);
    const body = url.endsWith('summary.json') ? summary : { '2900207': area };
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
}

describe('decodeArea', () => {
  it('unpacks the compact array', () => {
    expect(decodeArea(area, '05/10/2026', '12:51:47')).toEqual({
      el: 100, comp: 80, abst: 20, vv: 70, vb: 6, vn: 4, st: 10, ts: 10,
      dg: '05/10/2026', hg: '12:51:47', released: true, votes: [40, 30],
    });
  });
  it('an area without counted sections is not released', () => {
    expect(decodeArea([5, 0, 0, 0, 0, 0, 0, 1], '', '').released).toBe(false);
  });
});

describe('Round1Loader', () => {
  it('decodes the summary from the static snapshot', async () => {
    const calls: string[] = [];
    const s = await new Round1Loader(fakeFetch(calls)).summary();
    expect(calls).toEqual(['/data/r1/summary.json']);
    expect(s.candidates.map((c) => c.n)).toEqual([22, 13]);
    expect([s.br.votes, s.ufs.ba.el, s.countries['392'].vv, s.zz.hg, s.brUfsSum.dg]).toEqual([[40, 30], 100, 70, '12:51:47', '05/10/2026']);
  });
  it('loads each state and the abroad cities once', async () => {
    const calls: string[] = [];
    const loader = new Round1Loader(fakeFetch(calls));
    const a = await loader.municipalities('BA');
    await loader.municipalities('ba');
    await loader.abroadCities();
    await loader.abroadCities();
    expect(a['2900207'].votes).toEqual([40, 30]);
    expect(calls).toEqual(['/data/r1/summary.json', '/data/r1/mun/ba.json', '/data/r1/abroad.json']);
  });
  it('fails on HTTP errors and retries later', async () => {
    const calls: string[] = [];
    const loader = new Round1Loader(fakeFetch(calls, 404));
    await expect(loader.summary()).rejects.toThrow('404');
    await expect(loader.summary()).rejects.toThrow('404');
    expect(calls.filter((c) => c.endsWith('summary.json'))).toHaveLength(2);
  });
  it('uses the browser fetch by default', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', fakeFetch(calls));
    try {
      await new Round1Loader().summary();
      expect(calls).toEqual(['/data/r1/summary.json']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
