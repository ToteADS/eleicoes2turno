import { ApiClient, latest } from './api';

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('ApiClient', () => {
  it('builds the endpoint URLs', async () => {
    const calls: string[] = [];
    const fetchFn = ((url: string) => { calls.push(url); return ok({}); }) as unknown as typeof fetch;
    const api = new ApiClient('/api/v1', fetchFn);
    await api.summary();
    await api.municipalities('BA');
    await api.abroadCities();
    await api.config();
    expect(calls).toEqual(['/api/v1/summary', '/api/v1/uf/ba/municipalities', '/api/v1/abroad/cities', '/api/v1/config']);
  });

  it('throws on HTTP errors', async () => {
    const fetchFn = (() => Promise.resolve(new Response('x', { status: 503 }))) as unknown as typeof fetch;
    await expect(new ApiClient('/api/v1', fetchFn).summary()).rejects.toThrow('503');
  });
});

describe('latest', () => {
  it('delivers only the newest call per key', async () => {
    let resolveFirst!: (v: string) => void;
    const first = new Promise<string>((r) => { resolveFirst = r; });
    const a = latest('mun', () => first);
    const b = latest('mun', () => Promise.resolve('second'));
    resolveFirst('first');
    expect(await b).toBe('second');
    expect(await a).toBeUndefined();
  });

  it('keys are independent', async () => {
    const [x, y] = await Promise.all([latest('a', () => Promise.resolve(1)), latest('b', () => Promise.resolve(2))]);
    expect([x, y]).toEqual([1, 2]);
  });
});
