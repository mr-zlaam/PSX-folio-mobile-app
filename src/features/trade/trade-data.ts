import * as FileSystem from "expo-file-system/legacy";

export const PSX_SYMBOLS_ENDPOINT = "https://dps.psx.com.pk/symbols";
export const PSX_INTRADAY_ENDPOINT_BASE = "https://dps.psx.com.pk/timeseries/int";

const SYMBOLS_CACHE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-symbols-cache.json`
  : null;

export type PsxSymbol = {
  symbol: string;
  name: string;
  sectorName: string;
  isETF: boolean;
  isDebt: boolean;
};

export type SymbolQuote = {
  symbol: string;
  lastPrice: number;
  previousClose: number;
  highPrice: number;
  lowPrice: number;
  change: number;
  changePct: number;
  lastVolume: number;
  asOf: string | null;
  source: "live" | "cache" | "fallback";
};

type SymbolsCacheSnapshot = {
  updatedAt: string;
  symbols: PsxSymbol[];
};

type IntradayRow = [number, number, number];

type IntradayCacheSnapshot = {
  updatedAt: string;
  rows: IntradayRow[];
};

type RawSymbol = Partial<{
  symbol: unknown;
  name: unknown;
  sectorName: unknown;
  isETF: unknown;
  isDebt: unknown;
}>;

function sanitizeSymbol(rawSymbol: RawSymbol): PsxSymbol | null {
  if (typeof rawSymbol.symbol !== "string" || rawSymbol.symbol.trim().length === 0) {
    return null;
  }

  const symbol = rawSymbol.symbol.trim().toUpperCase();
  const name = typeof rawSymbol.name === "string" ? rawSymbol.name.trim() : symbol;
  const sectorName =
    typeof rawSymbol.sectorName === "string" && rawSymbol.sectorName.trim().length > 0
      ? rawSymbol.sectorName.trim()
      : "UNKNOWN";

  return {
    symbol,
    name,
    sectorName,
    isETF: rawSymbol.isETF === true,
    isDebt: rawSymbol.isDebt === true,
  };
}

function uniqueSymbols(symbols: PsxSymbol[]): PsxSymbol[] {
  const mapBySymbol = new Map<string, PsxSymbol>();
  for (const symbolItem of symbols) {
    if (!mapBySymbol.has(symbolItem.symbol)) {
      mapBySymbol.set(symbolItem.symbol, symbolItem);
    }
  }

  return Array.from(mapBySymbol.values()).sort((firstSymbol, secondSymbol) =>
    firstSymbol.symbol.localeCompare(secondSymbol.symbol)
  );
}

async function readSymbolsFromCache(): Promise<PsxSymbol[] | null> {
  if (!SYMBOLS_CACHE_FILE_URI) {
    return null;
  }

  try {
    const rawSnapshot = await FileSystem.readAsStringAsync(SYMBOLS_CACHE_FILE_URI);
    const parsedSnapshot = JSON.parse(rawSnapshot) as Partial<SymbolsCacheSnapshot>;
    if (!Array.isArray(parsedSnapshot.symbols)) {
      return null;
    }

    const sanitizedSymbols = parsedSnapshot.symbols
      .map((rawSymbol) => sanitizeSymbol(rawSymbol))
      .filter((symbolItem): symbolItem is PsxSymbol => symbolItem !== null);

    return sanitizedSymbols.length > 0 ? uniqueSymbols(sanitizedSymbols) : null;
  } catch {
    return null;
  }
}

async function writeSymbolsToCache(symbols: PsxSymbol[]): Promise<void> {
  if (!SYMBOLS_CACHE_FILE_URI || symbols.length === 0) {
    return;
  }

  const snapshot: SymbolsCacheSnapshot = {
    updatedAt: new Date().toISOString(),
    symbols,
  };

  try {
    await FileSystem.writeAsStringAsync(
      SYMBOLS_CACHE_FILE_URI,
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore symbol cache write errors in favor of keeping UI responsive.
  }
}

async function fetchSymbolsFromApi(): Promise<PsxSymbol[]> {
  const response = await fetch(PSX_SYMBOLS_ENDPOINT, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Symbol request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("Symbol API payload is not an array");
  }

  const sanitizedSymbols = payload
    .map((rawSymbol) => sanitizeSymbol(rawSymbol as RawSymbol))
    .filter((symbolItem): symbolItem is PsxSymbol => symbolItem !== null);

  if (sanitizedSymbols.length === 0) {
    throw new Error("Symbol API returned no valid symbols");
  }

  return uniqueSymbols(sanitizedSymbols);
}

function getIntradayCacheFileUri(symbol: string): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol.length === 0) {
    return null;
  }

  return `${FileSystem.documentDirectory}psx-int-${normalizedSymbol}.json`;
}

function isIntradayRow(row: unknown): row is IntradayRow {
  if (!Array.isArray(row) || row.length < 3) {
    return false;
  }

  const [timestamp, price, volume] = row;
  return (
    typeof timestamp === "number" &&
    Number.isFinite(timestamp) &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    typeof volume === "number" &&
    Number.isFinite(volume)
  );
}

function normalizeIntradayRows(rows: unknown): IntradayRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .filter(isIntradayRow)
    .map((row) => [row[0], row[1], row[2]] as IntradayRow)
    .sort((firstRow, secondRow) => secondRow[0] - firstRow[0]);
}

function deriveQuoteFromRows(
  symbol: string,
  rows: IntradayRow[],
  source: SymbolQuote["source"]
): SymbolQuote | null {
  if (rows.length === 0) {
    return null;
  }

  const latestRow = rows[0];
  const previousRow = rows[1] ?? latestRow;
  const lastPrice = latestRow[1];
  const previousPrice = previousRow[1];
  const highPrice = rows.reduce(
    (currentHigh, row) => (row[1] > currentHigh ? row[1] : currentHigh),
    rows[0][1]
  );
  const lowPrice = rows.reduce(
    (currentLow, row) => (row[1] < currentLow ? row[1] : currentLow),
    rows[0][1]
  );
  const change = lastPrice - previousPrice;
  const changePct = previousPrice === 0 ? 0 : (change / previousPrice) * 100;

  return {
    symbol: symbol.trim().toUpperCase(),
    lastPrice,
    previousClose: previousPrice,
    highPrice,
    lowPrice,
    change,
    changePct,
    lastVolume: latestRow[2],
    asOf: new Date(latestRow[0] * 1000).toISOString(),
    source,
  };
}

async function readIntradayRowsFromCache(symbol: string): Promise<IntradayRow[] | null> {
  const cacheFileUri = getIntradayCacheFileUri(symbol);
  if (!cacheFileUri) {
    return null;
  }

  try {
    const rawSnapshot = await FileSystem.readAsStringAsync(cacheFileUri);
    const parsedSnapshot = JSON.parse(rawSnapshot) as Partial<IntradayCacheSnapshot>;
    const rows = normalizeIntradayRows(parsedSnapshot.rows);

    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

async function writeIntradayRowsToCache(
  symbol: string,
  rows: IntradayRow[]
): Promise<void> {
  const cacheFileUri = getIntradayCacheFileUri(symbol);
  if (!cacheFileUri || rows.length === 0) {
    return;
  }

  const snapshot: IntradayCacheSnapshot = {
    updatedAt: new Date().toISOString(),
    rows,
  };

  try {
    await FileSystem.writeAsStringAsync(cacheFileUri, JSON.stringify(snapshot));
  } catch {
    // Ignore intraday cache write errors and continue with runtime data.
  }
}

async function fetchIntradayRowsFromApi(symbol: string): Promise<IntradayRow[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const response = await fetch(
    `${PSX_INTRADAY_ENDPOINT_BASE}/${encodeURIComponent(normalizedSymbol)}`,
    {
      headers: { Accept: "application/json" },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Intraday request failed for ${normalizedSymbol} (${response.status})`
    );
  }

  const payload = (await response.json()) as {
    status?: unknown;
    data?: unknown;
  };

  if (typeof payload.status === "number" && payload.status !== 1) {
    throw new Error(`Intraday API returned non-success status for ${normalizedSymbol}`);
  }

  const rows = normalizeIntradayRows(payload.data);
  if (rows.length === 0) {
    throw new Error(`Intraday API returned empty rows for ${normalizedSymbol}`);
  }

  return rows;
}

export async function getCachedSymbols(): Promise<PsxSymbol[]> {
  const symbols = await readSymbolsFromCache();
  return symbols ?? [];
}

export async function getLatestSymbols(): Promise<PsxSymbol[]> {
  try {
    const liveSymbols = await fetchSymbolsFromApi();
    await writeSymbolsToCache(liveSymbols);
    return liveSymbols;
  } catch {
    return getCachedSymbols();
  }
}

export function getSymbolQuoteFallback(symbol: string): SymbolQuote {
  return {
    symbol: symbol.trim().toUpperCase(),
    lastPrice: 0,
    previousClose: 0,
    highPrice: 0,
    lowPrice: 0,
    change: 0,
    changePct: 0,
    lastVolume: 0,
    asOf: null,
    source: "fallback",
  };
}

export async function getCachedSymbolQuote(symbol: string): Promise<SymbolQuote | null> {
  const rows = await readIntradayRowsFromCache(symbol);
  if (!rows) {
    return null;
  }

  return deriveQuoteFromRows(symbol, rows, "cache");
}

export async function getLatestSymbolQuote(symbol: string): Promise<SymbolQuote> {
  try {
    const liveRows = await fetchIntradayRowsFromApi(symbol);
    const liveQuote = deriveQuoteFromRows(symbol, liveRows, "live");
    if (!liveQuote) {
      throw new Error(`Unable to derive intraday quote for ${symbol}`);
    }

    await writeIntradayRowsToCache(symbol, liveRows);
    return liveQuote;
  } catch {
    const cachedQuote = await getCachedSymbolQuote(symbol);
    if (cachedQuote) {
      return cachedQuote;
    }

    return getSymbolQuoteFallback(symbol);
  }
}
