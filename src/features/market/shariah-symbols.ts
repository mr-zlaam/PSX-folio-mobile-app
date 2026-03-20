import React from "react";
import {
  getCachedMarketIndexConstituents,
  getLatestMarketIndexConstituents,
} from "@/src/features/market/market-data";

const SHARIAH_INDEX_CODE = "KMIALLSHR";

let inMemorySymbols: string[] = [];
let latestFetchPromise: Promise<string[]> | null = null;

function normalizeSymbols(symbols: string[]): string[] {
  const normalizedSet = new Set(
    symbols
      .map((symbol) => symbol.trim().toUpperCase())
      .filter((symbol) => symbol.length > 0)
  );
  return [...normalizedSet];
}

function symbolsFromSnapshot(snapshot: {
  items: Array<{ symbol: string }>;
} | null): string[] {
  if (!snapshot) {
    return [];
  }

  return normalizeSymbols(snapshot.items.map((item) => item.symbol));
}

export async function getCachedShariahSymbols(): Promise<string[]> {
  const cachedSnapshot = await getCachedMarketIndexConstituents(SHARIAH_INDEX_CODE);
  const cachedSymbols = symbolsFromSnapshot(cachedSnapshot);
  if (cachedSymbols.length > 0) {
    inMemorySymbols = cachedSymbols;
  }
  return cachedSymbols;
}

export async function getLatestShariahSymbols(): Promise<string[]> {
  if (latestFetchPromise) {
    return latestFetchPromise;
  }

  latestFetchPromise = (async () => {
    const latestSnapshot = await getLatestMarketIndexConstituents(SHARIAH_INDEX_CODE);
    const latestSymbols = symbolsFromSnapshot(latestSnapshot);
    if (latestSymbols.length > 0) {
      inMemorySymbols = latestSymbols;
    }
    return latestSymbols;
  })();

  try {
    return await latestFetchPromise;
  } finally {
    latestFetchPromise = null;
  }
}

export function useShariahSymbols(): {
  symbols: Set<string>;
  isLoading: boolean;
  isShariahCompliantSymbol: (symbol: string) => boolean;
} {
  const [symbols, setSymbols] = React.useState<Set<string>>(
    () => new Set(inMemorySymbols)
  );
  const [isLoading, setIsLoading] = React.useState(inMemorySymbols.length === 0);

  React.useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const cachedSymbols = await getCachedShariahSymbols();
        if (isMounted && cachedSymbols.length > 0) {
          setSymbols(new Set(cachedSymbols));
        }

        const latestSymbols = await getLatestShariahSymbols();
        if (isMounted && latestSymbols.length > 0) {
          setSymbols(new Set(latestSymbols));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  const isShariahCompliantSymbol = React.useCallback(
    (symbol: string) => {
      const normalizedSymbol = symbol.trim().toUpperCase();
      if (normalizedSymbol.length === 0) {
        return false;
      }
      return symbols.has(normalizedSymbol);
    },
    [symbols]
  );

  return {
    symbols,
    isLoading,
    isShariahCompliantSymbol,
  };
}

