import * as FileSystem from "expo-file-system/legacy";
import { getCachedDpsMarketStatus } from "@/src/features/market/dps-market-status";
import { shouldFetchLiveFromDelayedFeed } from "@/src/features/market/market-status";
import { getMemoryCache, setMemoryCache } from "@/src/lib/memory-cache";

export const PSX_SYMBOLS_ENDPOINT = "https://dps.psx.com.pk/symbols";
export const PSX_INTRADAY_ENDPOINT_BASE = "https://dps.psx.com.pk/timeseries/int";
export const PSX_EOD_ENDPOINT_BASE = "https://dps.psx.com.pk/timeseries/eod";
const PSX_NETWORK_TIMEOUT_MS = 8_000;

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
  totalVolume: number;
  asOf: string | null;
  source: "live" | "cache" | "fallback";
};

type SymbolsCacheSnapshot = {
  updatedAt: string;
  symbols: PsxSymbol[];
};

type IntradayRow = [number, number, number];
type EodRow = [number, number, number, number];

type IntradayCacheSnapshot = {
  updatedAt: string;
  rows: IntradayRow[];
};

type EodCacheSnapshot = {
  updatedAt: string;
  rows: EodRow[];
};

type RawSymbol = Partial<{
  symbol: unknown;
  name: unknown;
  sectorName: unknown;
  isETF: unknown;
  isDebt: unknown;
}>;

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs = PSX_NETWORK_TIMEOUT_MS
): Promise<Response> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: abortController.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

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
  const response = await fetchWithTimeout(PSX_SYMBOLS_ENDPOINT, {
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

function getEodCacheFileUri(symbol: string): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol.length === 0) {
    return null;
  }

  return `${FileSystem.documentDirectory}psx-eod-${normalizedSymbol}.json`;
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

function isEodRow(row: unknown): row is EodRow {
  if (!Array.isArray(row) || row.length < 4) {
    return false;
  }

  const [timestamp, closePrice, volume, openPrice] = row;
  return (
    typeof timestamp === "number" &&
    Number.isFinite(timestamp) &&
    typeof closePrice === "number" &&
    Number.isFinite(closePrice) &&
    typeof volume === "number" &&
    Number.isFinite(volume) &&
    typeof openPrice === "number" &&
    Number.isFinite(openPrice)
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

function normalizeEodRows(rows: unknown): EodRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .filter(isEodRow)
    .map((row) => [row[0], row[1], row[2], row[3]] as EodRow)
    .sort((firstRow, secondRow) => secondRow[0] - firstRow[0]);
}

function getDayKeyFromEpochSeconds(timestamp: number): number {
  return Math.floor(timestamp / 86_400);
}

function getPreviousCloseFromIntradayRows(rows: IntradayRow[]): number | null {
  if (rows.length < 2) {
    return null;
  }

  const latestDayKey = getDayKeyFromEpochSeconds(rows[0][0]);
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) {
      continue;
    }

    const rowDayKey = getDayKeyFromEpochSeconds(row[0]);
    if (rowDayKey < latestDayKey && Number.isFinite(row[1]) && row[1] > 0) {
      return row[1];
    }
  }

  return null;
}

function getPreviousCloseFromEodRows(
  rows: EodRow[],
  latestIntradayTimestamp: number
): number | null {
  if (rows.length === 0) {
    return null;
  }

  const latestIntradayDayKey = getDayKeyFromEpochSeconds(latestIntradayTimestamp);
  for (const row of rows) {
    const rowDayKey = getDayKeyFromEpochSeconds(row[0]);
    if (rowDayKey < latestIntradayDayKey && Number.isFinite(row[1]) && row[1] > 0) {
      return row[1];
    }
  }

  return null;
}

function deriveQuoteFromRows(
  symbol: string,
  rows: IntradayRow[],
  source: SymbolQuote["source"],
  previousCloseOverride: number | null = null
): SymbolQuote | null {
  if (rows.length === 0) {
    return null;
  }

  const latestRow = rows[0];
  const previousRow = rows[1] ?? latestRow;
  const lastPrice = latestRow[1];
  const previousPrice =
    typeof previousCloseOverride === "number" &&
    Number.isFinite(previousCloseOverride) &&
    previousCloseOverride > 0
      ? previousCloseOverride
      : previousRow[1];
  const highPrice = rows.reduce(
    (currentHigh, row) => (row[1] > currentHigh ? row[1] : currentHigh),
    rows[0][1]
  );
  const lowPrice = rows.reduce(
    (currentLow, row) => (row[1] < currentLow ? row[1] : currentLow),
    rows[0][1]
  );
  const totalVolume = rows.reduce(
    (runningTotal, row) => runningTotal + Math.max(0, row[2]),
    0
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
    totalVolume,
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

async function readEodRowsFromCache(symbol: string): Promise<EodRow[] | null> {
  const cacheFileUri = getEodCacheFileUri(symbol);
  if (!cacheFileUri) {
    return null;
  }

  try {
    const rawSnapshot = await FileSystem.readAsStringAsync(cacheFileUri);
    const parsedSnapshot = JSON.parse(rawSnapshot) as Partial<EodCacheSnapshot>;
    const rows = normalizeEodRows(parsedSnapshot.rows);
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

async function writeEodRowsToCache(symbol: string, rows: EodRow[]): Promise<void> {
  const cacheFileUri = getEodCacheFileUri(symbol);
  if (!cacheFileUri || rows.length === 0) {
    return;
  }

  const snapshot: EodCacheSnapshot = {
    updatedAt: new Date().toISOString(),
    rows,
  };

  try {
    await FileSystem.writeAsStringAsync(cacheFileUri, JSON.stringify(snapshot));
  } catch {
    // Ignore EOD cache write errors to keep runtime flow resilient.
  }
}

async function fetchIntradayRowsFromApi(symbol: string): Promise<IntradayRow[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const response = await fetchWithTimeout(
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

async function fetchEodRowsFromApi(symbol: string): Promise<EodRow[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const response = await fetchWithTimeout(
    `${PSX_EOD_ENDPOINT_BASE}/${encodeURIComponent(normalizedSymbol)}`,
    {
      headers: { Accept: "application/json" },
    }
  );

  if (!response.ok) {
    throw new Error(`EOD request failed for ${normalizedSymbol} (${response.status})`);
  }

  const payload = (await response.json()) as {
    status?: unknown;
    data?: unknown;
  };

  if (typeof payload.status === "number" && payload.status !== 1) {
    throw new Error(`EOD API returned non-success status for ${normalizedSymbol}`);
  }

  const rows = normalizeEodRows(payload.data);
  if (rows.length === 0) {
    throw new Error(`EOD API returned empty rows for ${normalizedSymbol}`);
  }

  await writeEodRowsToCache(normalizedSymbol, rows);
  return rows;
}

async function shouldUseCachedQuote(options: {
  asOf: string | null;
  hasUsableCache: boolean;
  forceLive?: boolean;
}): Promise<boolean> {
  const { asOf, hasUsableCache, forceLive = false } = options;
  if (forceLive || !hasUsableCache) {
    return false;
  }

  try {
    const cachedMarketStatus = await getCachedDpsMarketStatus();
    if (cachedMarketStatus.uiStatus !== "OPEN") {
      // Keep quote cache warm for instant paint, but revalidate from source
      // when market is not open to avoid stale session snapshots.
      return false;
    }

    return !shouldFetchLiveFromDelayedFeed({
      asOf,
      marketUiStatus: cachedMarketStatus.uiStatus,
      hasUsableCache,
      forceLive,
    });
  } catch {
    return false;
  }
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

export async function getStrictLiveSymbols(): Promise<PsxSymbol[]> {
  const liveSymbols = await fetchSymbolsFromApi();
  await writeSymbolsToCache(liveSymbols);
  return liveSymbols;
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
    totalVolume: 0,
    asOf: null,
    source: "fallback",
  };
}

export async function getCachedSymbolQuote(symbol: string): Promise<SymbolQuote | null> {
  const memoryKey = `quote:${symbol}`;
  const cached = getMemoryCache<SymbolQuote>("trade-data", memoryKey, 15_000);
  if (cached) {
    return cached;
  }

  const [intradayRows, eodRows] = await Promise.all([
    readIntradayRowsFromCache(symbol),
    readEodRowsFromCache(symbol),
  ]);
  const rows = intradayRows;
  if (!rows) {
    return null;
  }

  const previousClose =
    getPreviousCloseFromIntradayRows(rows) ??
    getPreviousCloseFromEodRows(eodRows ?? [], rows[0][0]);

  const quote = deriveQuoteFromRows(symbol, rows, "cache", previousClose);
  if (quote) {
    setMemoryCache("trade-data", memoryKey, quote);
  }
  return quote;
}

export async function getLatestSymbolQuote(
  symbol: string,
  options?: {
    forceLive?: boolean;
  }
): Promise<SymbolQuote> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol.length === 0) {
    return getSymbolQuoteFallback(symbol);
  }

  const memoryKey = `live-quote:${normalizedSymbol}`;
  const memoryCached = getMemoryCache<SymbolQuote>("trade-data", memoryKey, 8_000);
  if (memoryCached && !options?.forceLive) {
    return memoryCached;
  }

  const cachedQuote = await getCachedSymbolQuote(normalizedSymbol);
  const hasUsableCachedQuote = Boolean(
    cachedQuote &&
      (cachedQuote.asOf !== null ||
        cachedQuote.lastPrice > 0 ||
        cachedQuote.previousClose > 0)
  );
  const shouldReturnCachedQuote = await shouldUseCachedQuote({
    asOf: cachedQuote?.asOf ?? null,
    hasUsableCache: hasUsableCachedQuote,
    forceLive: options?.forceLive === true,
  });
  if (shouldReturnCachedQuote && cachedQuote) {
    return cachedQuote;
  }

  try {
    const [liveRows, liveEodRows] = await Promise.all([
      fetchIntradayRowsFromApi(normalizedSymbol),
      fetchEodRowsFromApi(normalizedSymbol).catch(() => [] as EodRow[]),
    ]);

    const previousClose =
      getPreviousCloseFromIntradayRows(liveRows) ??
      getPreviousCloseFromEodRows(liveEodRows, liveRows[0][0]) ??
      0;

    const liveQuote = deriveQuoteFromRows(
      normalizedSymbol,
      liveRows,
      "live",
      previousClose
    );
    if (!liveQuote) {
      throw new Error(`Unable to derive intraday quote for ${normalizedSymbol}`);
    }

    setMemoryCache("trade-data", memoryKey, liveQuote);
    await writeIntradayRowsToCache(normalizedSymbol, liveRows);
    return liveQuote;
  } catch {
    if (cachedQuote) {
      return cachedQuote;
    }

    return getSymbolQuoteFallback(symbol);
  }
}

export async function getStrictLiveSymbolQuote(symbol: string): Promise<SymbolQuote> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol.length === 0) {
    return getSymbolQuoteFallback(symbol);
  }

  const [liveRows, liveEodRows] = await Promise.all([
    fetchIntradayRowsFromApi(normalizedSymbol),
    fetchEodRowsFromApi(normalizedSymbol).catch(() => [] as EodRow[]),
  ]);

  const previousClose =
    getPreviousCloseFromIntradayRows(liveRows) ??
    getPreviousCloseFromEodRows(liveEodRows, liveRows[0][0]);

  const liveQuote = deriveQuoteFromRows(
    normalizedSymbol,
    liveRows,
    "live",
    previousClose
  );
  if (!liveQuote) {
    throw new Error(`Unable to derive live quote for ${normalizedSymbol}`);
  }

  await writeIntradayRowsToCache(normalizedSymbol, liveRows);
  return liveQuote;
}
