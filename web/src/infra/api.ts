import type { PresenceDto } from '../domain/dtos/presence-dto';
import type { AreaListResponse, PresenceAnswer, PublicConfig, Summary } from '../domain/types';

/** Client of our own API (never the TSE directly). */
export class ApiClient {
  constructor(
    private readonly base = '/api/v1',
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  summary(): Promise<Summary> {
    return this.get('/summary');
  }

  municipalities(uf: string): Promise<AreaListResponse> {
    return this.get(`/uf/${uf.toLowerCase()}/municipalities`);
  }

  abroadCities(): Promise<AreaListResponse> {
    return this.get('/abroad/cities');
  }

  config(): Promise<PublicConfig> {
    return this.get('/config');
  }

  /** Heartbeat of this tab; answers how many tabs are online. */
  async presence(dto: PresenceDto): Promise<PresenceAnswer> {
    const res = await this.fetchFn(this.base + '/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto.toJson()),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`POST /presence: ${res.status}`);
    return (await res.json()) as PresenceAnswer;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchFn(this.base + path);
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return (await res.json()) as T;
  }
}

const generations = new Map<string, number>();

/**
 * Runs `run` and resolves with its value only if no newer call with the same key
 * started meanwhile; superseded calls resolve with undefined.
 */
export async function latest<T>(key: string, run: () => Promise<T>): Promise<T | undefined> {
  const gen = (generations.get(key) ?? 0) + 1;
  generations.set(key, gen);
  const value = await run();
  return generations.get(key) === gen ? value : undefined;
}
