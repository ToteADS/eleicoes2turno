import { isTabId, tabId } from './tab-id';

const memoryStorage = (seed: Record<string, string> = {}) => {
  const data = { ...seed };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = v; },
  };
};
const throwing = () => { throw new Error('SecurityError'); };

describe('tabId', () => {
  it('creates an id and keeps it for the session', () => {
    const storage = memoryStorage();
    const id = tabId({ storage: () => storage, uuid: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    expect(id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(Object.values(storage.data)).toEqual([id]);
    expect(tabId({ storage: () => storage, uuid: () => 'ffffffff-0000-4000-8000-000000000000' })).toBe(id);
  });

  it('replaces a stored value that is not a valid id', () => {
    const storage = memoryStorage();
    tabId({ storage: () => storage, uuid: () => 'aaaaaaaa-1111' });
    const key = Object.keys(storage.data)[0];
    storage.data[key] = '<script>';
    expect(tabId({ storage: () => storage, uuid: () => 'bbbbbbbb-2222' })).toBe('bbbbbbbb-2222');
  });

  it('falls back to an in-memory id when storage is blocked', () => {
    expect(tabId({ storage: throwing, uuid: () => 'cccccccc-3333' })).toBe('cccccccc-3333');
    const readOnly = { getItem: () => null, setItem: throwing };
    expect(tabId({ storage: () => readOnly, uuid: () => 'dddddddd-4444' })).toBe('dddddddd-4444');
  });

  it('uses the browser session storage and UUIDs by default', () => {
    sessionStorage.clear();
    const id = tabId();
    expect(isTabId(id)).toBe(true);
    expect(tabId()).toBe(id);
  });

  it('builds a random hex id where randomUUID is missing (insecure contexts)', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const id = tabId({ storage: throwing });
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(tabId({ storage: throwing })).not.toBe(id);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });

  it('validates ids like the API does', () => {
    expect(isTabId('abcdefgh')).toBe(true);
    expect(isTabId('a'.repeat(64))).toBe(true);
    expect(isTabId('abcdefg')).toBe(false);
    expect(isTabId('a'.repeat(65))).toBe(false);
    expect(isTabId('abcd efgh')).toBe(false);
    expect(isTabId(null)).toBe(false);
  });
});
