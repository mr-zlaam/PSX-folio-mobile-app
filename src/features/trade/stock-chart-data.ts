import * as FileSystem from "expo-file-system/legacy";
import { getCachedDpsMarketStatus } from "@/src/features/market/dps-market-status";
import { shouldFetchLiveFromDelayedFeed } from "@/src/features/market/market-status";

const PSX_INTRADAY_ENDPOINT_BASE = "https://dps.psx.com.pk/timeseries/int";
const PSX_EOD_ENDPOINT_BASE = "https://dps.psx.com.pk/timeseries/eod";

export type StockChartRange = "1D" | "1M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y";

export type StockChartPoint = {
  timestamp: number;
  price: number;
};

export type StockChartSeries = {
  range: StockChartRange;
  points: StockChartPoint[];
  asOf: string | null;
  source: "live" | "cache" | "fallback";
};

type IntradayRow = [number, number, number];
type EodRow = [number, number, number, number];

type CacheSnapshot<T> = {
  updatedAt: string;
  rows: T[];
};

function getIntradayCacheFileUri(symbol: string): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol.length === 0) {
    return null;
  }

  return `${FileSystem.documentDirectory}psx-chart-int-${normalizedSymbol}.json`;
}

function getEodCacheFileUri(symbol: string): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol.length === 0) {
    return null;
  }

  return `${FileSystem.documentDirectory}psx-chart-eod-${normalizedSymbol}.json`;
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

async function readRowsFromCache<T>(
  cacheFileUri: string | null,
  normalizeRows: (rows: unknown) => T[]
): Promise<T[] | null> {
  if (!cacheFileUri) {
    return null;
  }

  try {
    const rawSnapshot = await FileSystem.readAsStringAsync(cacheFileUri);
    const parsedSnapshot = JSON.parse(rawSnapshot) as Partial<CacheSnapshot<T>>;
    const rows = normalizeRows(parsedSnapshot.rows);
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

async function writeRowsToCache<T>(
  cacheFileUri: string | null,
  rows: T[]
): Promise<void> {
  if (!cacheFileUri || rows.length === 0) {
    return;
  }

  const snapshot: CacheSnapshot<T> = {
    updatedAt: new Date().toISOString(),
    rows,
  };

  try {
    await FileSystem.writeAsStringAsync(cacheFileUri, JSON.stringify(snapshot));
  } catch {
    // Ignore chart cache write failures to keep runtime flow resilient.
  }
}

async function fetchRowsFromApi(
  endpoint: string,
  normalizedSymbol: string
): Promise<unknown[]> {
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${normalizedSymbol} (${response.status})`);
  }

  const payload = (await response.json()) as {
    status?: unknown;
    data?: unknown;
  };

  if (typeof payload.status === "number" && payload.status !== 1) {
    throw new Error(`API returned non-success status for ${normalizedSymbol}`);
  }

  if (!Array.isArray(payload.data)) {
    throw new Error(`API returned invalid rows for ${normalizedSymbol}`);
  }

  return payload.data;
}

async function getCachedIntradayRows(symbol: string): Promise<IntradayRow[]> {
  const rows = await readRowsFromCache(
    getIntradayCacheFileUri(symbol),
    normalizeIntradayRows
  );
  return rows ?? [];
}

async function getCachedEodRows(symbol: string): Promise<EodRow[]> {
  const rows = await readRowsFromCache(getEodCacheFileUri(symbol), normalizeEodRows);
  return rows ?? [];
}

async function getLatestIntradayRows(symbol: string): Promise<IntradayRow[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const payloadRows = await fetchRowsFromApi(
    `${PSX_INTRADAY_ENDPOINT_BASE}/${encodeURIComponent(normalizedSymbol)}`,
    normalizedSymbol
  );
  const rows = normalizeIntradayRows(payloadRows);
  if (rows.length === 0) {
    throw new Error(`Intraday API returned empty rows for ${normalizedSymbol}`);
  }

  await writeRowsToCache(getIntradayCacheFileUri(normalizedSymbol), rows);
  return rows;
}

async function getLatestEodRows(symbol: string): Promise<EodRow[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const payloadRows = await fetchRowsFromApi(
    `${PSX_EOD_ENDPOINT_BASE}/${encodeURIComponent(normalizedSymbol)}`,
    normalizedSymbol
  );
  const rows = normalizeEodRows(payloadRows);
  if (rows.length === 0) {
    throw new Error(`EOD API returned empty rows for ${normalizedSymbol}`);
  }

  await writeRowsToCache(getEodCacheFileUri(normalizedSymbol), rows);
  return rows;
}

async function shouldUseCachedChartSeries(options: {
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
      // Outside market session, treat chart cache as stale and allow
      // periodic revalidation from source (pull-to-refresh still force-live).
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

function downsamplePoints(points: StockChartPoint[], maxPoints = 180): StockChartPoint[] {
  if (points.length <= maxPoints) {
    return points;
  }

  const step = Math.ceil(points.length / maxPoints);
  const sampledPoints: StockChartPoint[] = [];

  for (let index = 0; index < points.length; index += step) {
    sampledPoints.push(points[index]);
  }

  const lastPoint = points[points.length - 1];
  if (sampledPoints[sampledPoints.length - 1]?.timestamp !== lastPoint.timestamp) {
    sampledPoints.push(lastPoint);
  }

  return sampledPoints;
}

function buildOneDayPoints(
  intradayRows: IntradayRow[],
  eodRows: EodRow[]
): StockChartPoint[] {
  if (intradayRows.length > 0) {
    const latestDate = new Date(intradayRows[0][0] * 1000);
    const latestYear = latestDate.getFullYear();
    const latestMonth = latestDate.getMonth();
    const latestDay = latestDate.getDate();

    const sameDayRows = intradayRows.filter((row) => {
      const rowDate = new Date(row[0] * 1000);
      return (
        rowDate.getFullYear() === latestYear &&
        rowDate.getMonth() === latestMonth &&
        rowDate.getDate() === latestDay
      );
    });

    if (sameDayRows.length > 0) {
      return sameDayRows
        .slice()
        .sort((firstRow, secondRow) => firstRow[0] - secondRow[0])
        .map((row) => ({
          timestamp: row[0] * 1000,
          price: row[1],
        }));
    }
  }

  return eodRows
    .slice(0, 30)
    .sort((firstRow, secondRow) => firstRow[0] - secondRow[0])
    .map((row) => ({
      timestamp: row[0] * 1000,
      price: row[1],
    }));
}

function getRangeStartDate(range: Exclude<StockChartRange, "1D">, now: Date): Date {
  const nextDate = new Date(now);

  if (range === "YTD") {
    return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  }

  if (range === "1M") {
    nextDate.setMonth(nextDate.getMonth() - 1);
    return nextDate;
  }

  if (range === "6M") {
    nextDate.setMonth(nextDate.getMonth() - 6);
    return nextDate;
  }

  if (range === "1Y") {
    nextDate.setFullYear(nextDate.getFullYear() - 1);
    return nextDate;
  }

  if (range === "3Y") {
    nextDate.setFullYear(nextDate.getFullYear() - 3);
    return nextDate;
  }

  nextDate.setFullYear(nextDate.getFullYear() - 5);
  return nextDate;
}

function buildLongRangePoints(range: Exclude<StockChartRange, "1D">, eodRows: EodRow[]): StockChartPoint[] {
  if (eodRows.length === 0) {
    return [];
  }

  const startDate = getRangeStartDate(range, new Date());
  const startTimestampMs = startDate.getTime();

  const rangedRows = eodRows.filter((row) => row[0] * 1000 >= startTimestampMs);
  const sourceRows = rangedRows.length > 0 ? rangedRows : eodRows;

  return sourceRows
    .slice()
    .sort((firstRow, secondRow) => firstRow[0] - secondRow[0])
    .map((row) => ({
      timestamp: row[0] * 1000,
      price: row[1],
    }));
}

function buildSeriesFromRows(
  range: StockChartRange,
  intradayRows: IntradayRow[],
  eodRows: EodRow[],
  source: StockChartSeries["source"]
): StockChartSeries {
  const points =
    range === "1D"
      ? buildOneDayPoints(intradayRows, eodRows)
      : buildLongRangePoints(range, eodRows);

  const normalizedPoints = downsamplePoints(points);
  const asOfTimestamp =
    normalizedPoints.length > 0
      ? normalizedPoints[normalizedPoints.length - 1].timestamp
      : null;

  return {
    range,
    points: normalizedPoints,
    asOf: asOfTimestamp ? new Date(asOfTimestamp).toISOString() : null,
    source,
  };
}

export function getStockChartSeriesFallback(range: StockChartRange): StockChartSeries {
  return {
    range,
    points: [],
    asOf: null,
    source: "fallback",
  };
}

export async function getCachedStockChartSeries(
  symbol: string,
  range: StockChartRange
): Promise<StockChartSeries> {
  const [cachedIntradayRows, cachedEodRows] = await Promise.all([
    getCachedIntradayRows(symbol),
    getCachedEodRows(symbol),
  ]);

  const series = buildSeriesFromRows(range, cachedIntradayRows, cachedEodRows, "cache");
  return series.points.length > 0 ? series : getStockChartSeriesFallback(range);
}

export async function getLatestStockChartSeries(
  symbol: string,
  range: StockChartRange,
  options?: {
    forceLive?: boolean;
  }
): Promise<StockChartSeries> {
  const cachedSeries = await getCachedStockChartSeries(symbol, range);
  const hasUsableCachedSeries = cachedSeries.points.length > 0;
  const shouldReturnCachedSeries = await shouldUseCachedChartSeries({
    asOf: cachedSeries.asOf,
    hasUsableCache: hasUsableCachedSeries,
    forceLive: options?.forceLive === true,
  });
  if (shouldReturnCachedSeries) {
    return cachedSeries;
  }

  try {
    if (range === "1D") {
      const [latestIntradayRows, latestEodRows] = await Promise.all([
        getLatestIntradayRows(symbol).catch(() => []),
        getLatestEodRows(symbol).catch(() => []),
      ]);

      const series = buildSeriesFromRows(range, latestIntradayRows, latestEodRows, "live");
      if (series.points.length > 0) {
        return series;
      }
    } else {
      const latestEodRows = await getLatestEodRows(symbol);
      const series = buildSeriesFromRows(range, [], latestEodRows, "live");
      if (series.points.length > 0) {
        return series;
      }
    }
  } catch {
    // Continue to cached fallback below.
  }

  return cachedSeries.points.length > 0
    ? cachedSeries
    : getStockChartSeriesFallback(range);
}
