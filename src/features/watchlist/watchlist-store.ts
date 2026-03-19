import * as FileSystem from "expo-file-system/legacy";

export type WatchlistItem = {
  symbol: string;
  addedAt: string;
};

type WatchlistStore = {
  version: 1;
  items: WatchlistItem[];
  updatedAt: string;
};

const WATCHLIST_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-watchlist.json`
  : null;

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function getEmptyStore(): WatchlistStore {
  return {
    version: 1,
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

function getSafeStore(value: unknown): WatchlistStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getEmptyStore();
  }

  const rawStore = value as Partial<WatchlistStore>;
  const rawItems = Array.isArray(rawStore.items) ? rawStore.items : [];

  const deduplicated = new Map<string, WatchlistItem>();
  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const rawSymbol = (item as Partial<WatchlistItem>).symbol;
    const rawAddedAt = (item as Partial<WatchlistItem>).addedAt;
    if (typeof rawSymbol !== "string" || typeof rawAddedAt !== "string") {
      continue;
    }

    const normalizedSymbol = normalizeSymbol(rawSymbol);
    if (normalizedSymbol.length === 0) {
      continue;
    }

    if (!deduplicated.has(normalizedSymbol)) {
      deduplicated.set(normalizedSymbol, {
        symbol: normalizedSymbol,
        addedAt: rawAddedAt,
      });
    }
  }

  return {
    version: 1,
    items: Array.from(deduplicated.values()),
    updatedAt:
      typeof rawStore.updatedAt === "string"
        ? rawStore.updatedAt
        : new Date().toISOString(),
  };
}

async function readStore(): Promise<WatchlistStore> {
  if (!WATCHLIST_FILE_URI) {
    return getEmptyStore();
  }

  try {
    const rawValue = await FileSystem.readAsStringAsync(WATCHLIST_FILE_URI);
    return getSafeStore(JSON.parse(rawValue));
  } catch {
    return getEmptyStore();
  }
}

async function writeStore(store: WatchlistStore): Promise<void> {
  if (!WATCHLIST_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(WATCHLIST_FILE_URI, JSON.stringify(store));
}

function sortByRecent(items: WatchlistItem[]): WatchlistItem[] {
  return [...items].sort((firstItem, secondItem) => {
    const firstTimestamp = new Date(firstItem.addedAt).getTime();
    const secondTimestamp = new Date(secondItem.addedAt).getTime();

    if (Number.isFinite(firstTimestamp) && Number.isFinite(secondTimestamp)) {
      if (firstTimestamp !== secondTimestamp) {
        return secondTimestamp - firstTimestamp;
      }
    } else if (Number.isFinite(firstTimestamp)) {
      return -1;
    } else if (Number.isFinite(secondTimestamp)) {
      return 1;
    }

    return firstItem.symbol.localeCompare(secondItem.symbol);
  });
}

export async function getSavedWatchlistItems(): Promise<WatchlistItem[]> {
  const store = await readStore();
  return sortByRecent(store.items);
}

export async function getSavedWatchlistSymbols(): Promise<string[]> {
  const items = await getSavedWatchlistItems();
  return items.map((item) => item.symbol);
}

export async function addSymbolToWatchlist(symbol: string): Promise<boolean> {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (normalizedSymbol.length === 0) {
    throw new Error("Invalid symbol");
  }

  const store = await readStore();
  const alreadyExists = store.items.some((item) => item.symbol === normalizedSymbol);
  if (alreadyExists) {
    return false;
  }

  const nextStore: WatchlistStore = {
    version: 1,
    items: [
      {
        symbol: normalizedSymbol,
        addedAt: new Date().toISOString(),
      },
      ...store.items,
    ],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(nextStore);
  return true;
}

export async function removeSymbolFromWatchlist(symbol: string): Promise<void> {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (normalizedSymbol.length === 0) {
    return;
  }

  const store = await readStore();
  const nextItems = store.items.filter((item) => item.symbol !== normalizedSymbol);

  if (nextItems.length === store.items.length) {
    return;
  }

  const nextStore: WatchlistStore = {
    version: 1,
    items: nextItems,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(nextStore);
}
