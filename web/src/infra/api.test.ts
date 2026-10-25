import { PresenceDto } from '../domain/dtos/presence-dto';
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

  it('posts the presence DTO as JSON and returns the online count', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = ((url: string, init?: RequestInit) => { calls.push({ url, init }); return ok({ online: 42 }); }) as unknown as typeof fetch;
    const got = await new ApiClient('/api/v1', fetchFn).presence(new PresenceDto('abcdefgh-1234'));
    expect(got).toEqual({ online: 42 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/v1/presence');
    expect(calls[0].init?.method).toBe('POST');
    expect(new Headers(calls[0].init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ id: 'abcdefgh-1234' });
    expect(calls[0].init?.cache).toBe('no-store');
  });

  it('throws on presence HTTP errors', async () => {
    const fetchFn = (() => Promise.resolve(new Response('x', { status: 429 }))) as unknown as typeof fetch;
    await expect(new ApiClient('/api/v1', fetchFn).presence(new PresenceDto('abcdefgh'))).rejects.toThrow('POST /presence: 429');
  });

  it('fetches the notice uncached and reads it through the model', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return ok({ notice: { title: 'Aviso', body: 'b', linkUrl: 'javascript:x', linkLabel: '', updatedAt: '' } });
    }) as unknown as typeof fetch;
    const got = await new ApiClient('/api/v1', fetchFn).notice();
    expect(got).toEqual({ title: 'Aviso', body: 'b', linkUrl: '', linkLabel: '', updatedAt: '' });
    expect(calls[0].url).toBe('/api/v1/notice');
    expect(calls[0].init?.cache).toBe('no-store');
  });

  it('answers null when there is no notice and throws on notice HTTP errors', async () => {
    expect(await new ApiClient('/api/v1', (() => ok({ notice: null })) as unknown as typeof fetch).notice()).toBeNull();
    const fail = (() => Promise.resolve(new Response('x', { status: 500 }))) as unknown as typeof fetch;
    await expect(new ApiClient('/api/v1', fail).notice()).rejects.toThrow('GET /notice: 500');
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
