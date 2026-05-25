const stores = new Map<string, Map<string, { data: unknown; fetchedAt: number }>>();
const DEFAULT_TTL_MS = 30_000;

function getStore<T>(namespace: string): Map<string, { data: T; fetchedAt: number }> {
  if (!stores.has(namespace)) {
    stores.set(namespace, new Map());
  }
  return stores.get(namespace) as Map<string, { data: T; fetchedAt: number }>;
}

export function getMemoryCache<T>(namespace: string, key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const store = getStore<T>(namespace);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setMemoryCache<T>(namespace: string, key: string, data: T): void {
  getStore<T>(namespace).set(key, { data, fetchedAt: Date.now() });
}

export function clearMemoryCache(namespace?: string): void {
  if (namespace) {
    stores.delete(namespace);
  } else {
    stores.clear();
  }
}
