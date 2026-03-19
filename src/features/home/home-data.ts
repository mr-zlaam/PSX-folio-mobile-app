import * as FileSystem from "expo-file-system/legacy";
import { HomeSnapshot } from "@/src/features/home/types";

export const KSE100_EOD_ENDPOINT = "https://dps.psx.com.pk/timeseries/eod/KSE100";
export const MOCK_LATEST_KSE100_POINTS = 154292.25;
export type InsightDisplayMode = "percentage" | "price";

export type Kse100Summary = {
  points: number;
  change: number;
  changePct: number;
  asOf: string | null;
  source: "live" | "cache" | "fallback";
};

export type Kse100TimeseriesRow = [number, number, number, number];

type Kse100CacheSnapshot = {
  updatedAt: string;
  rows: Kse100TimeseriesRow[];
};

const KSE100_CACHE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kse100-timeseries-cache.json`
  : null;

const MOCK_KSE100_SUMMARY: Kse100Summary = {
  points: MOCK_LATEST_KSE100_POINTS,
  change: 0,
  changePct: 0,
  asOf: null,
  source: "fallback",
};

export const HOME_PLACEHOLDER_SNAPSHOT: HomeSnapshot = {
  summary: {
    invested: 100000,
    value: 112000,
    profit: 12000,
    returnPct: 12,
  },
  insights: [
    {
      label: "Top Stock",
      symbol: "MEBL",
      valueText: "38% of portfolio",
    },
    {
      label: "Best Gain",
      symbol: "FFC",
      valueText: "+8.0%",
    },
    {
      label: "Worst Loss",
      symbol: "LUCK",
      valueText: "-3.0%",
    },
  ],
};

const HOME_INSIGHT_DISPLAY_VALUES: Record<
  string,
  { percentage: string; price: string }
> = {
  MEBL: {
    percentage: "38% of portfolio",
    price: "PKR 42,560",
  },
  FFC: {
    percentage: "+8.0%",
    price: "+PKR 3,240",
  },
  LUCK: {
    percentage: "-3.0%",
    price: "-PKR 1,180",
  },
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidRow(value: unknown): value is Kse100TimeseriesRow {
  if (!Array.isArray(value) || value.length < 4) {
    return false;
  }

  return (
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1]) &&
    isFiniteNumber(value[2]) &&
    isFiniteNumber(value[3])
  );
}

function normalizeRows(input: unknown): Kse100TimeseriesRow[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const validRows = input
    .filter(isValidRow)
    .map((row) => [row[0], row[1], row[2], row[3]] as Kse100TimeseriesRow)
    .sort((firstRow, secondRow) => secondRow[0] - firstRow[0]);

  return validRows;
}

function deriveKse100SummaryFromRows(
  rows: Kse100TimeseriesRow[]
): Omit<Kse100Summary, "source"> | null {
  if (rows.length === 0) {
    return null;
  }

  const latestRow = rows[0];
  const previousRow = rows[1] ?? latestRow;
  const latestClose = latestRow[1];
  const previousClose = previousRow[1];

  const change = latestClose - previousClose;
  const changePct = previousClose === 0 ? 0 : (change / previousClose) * 100;
  const asOf = new Date(latestRow[0] * 1000).toISOString();

  return {
    points: latestClose,
    change,
    changePct,
    asOf,
  };
}

async function readRowsFromCache(): Promise<Kse100TimeseriesRow[] | null> {
  if (!KSE100_CACHE_FILE_URI) {
    return null;
  }

  try {
    const rawSnapshot = await FileSystem.readAsStringAsync(KSE100_CACHE_FILE_URI);
    const parsedSnapshot = JSON.parse(rawSnapshot) as Partial<Kse100CacheSnapshot>;
    const rows = normalizeRows(parsedSnapshot.rows);

    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

async function writeRowsToCache(rows: Kse100TimeseriesRow[]): Promise<void> {
  if (!KSE100_CACHE_FILE_URI || rows.length === 0) {
    return;
  }

  const snapshot: Kse100CacheSnapshot = {
    updatedAt: new Date().toISOString(),
    rows,
  };

  try {
    await FileSystem.writeAsStringAsync(
      KSE100_CACHE_FILE_URI,
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore cache write failures and continue with live data.
  }
}

async function fetchRowsFromApi(): Promise<Kse100TimeseriesRow[]> {
  const response = await fetch(KSE100_EOD_ENDPOINT, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`KSE-100 request failed with status ${response.status}`);
  }

  const parsedPayload = (await response.json()) as {
    status?: unknown;
    data?: unknown;
  };

  if (
    typeof parsedPayload.status === "number" &&
    parsedPayload.status !== 1
  ) {
    throw new Error("KSE-100 API returned unsuccessful status");
  }

  const rows = normalizeRows(parsedPayload.data);
  if (rows.length === 0) {
    throw new Error("KSE-100 API returned empty timeseries");
  }

  return rows;
}

export function getHomeSnapshot(): HomeSnapshot {
  return HOME_PLACEHOLDER_SNAPSHOT;
}

export function getLatestKse100PointsMock(): number {
  return MOCK_LATEST_KSE100_POINTS;
}

export function getLatestKse100SummaryMock(): Kse100Summary {
  return MOCK_KSE100_SUMMARY;
}

export async function getCachedKse100Summary(): Promise<Kse100Summary | null> {
  const cachedRows = await readRowsFromCache();
  if (!cachedRows) {
    return null;
  }

  const derivedSummary = deriveKse100SummaryFromRows(cachedRows);
  if (!derivedSummary) {
    return null;
  }

  return {
    ...derivedSummary,
    source: "cache",
  };
}

export async function getLatestKse100Summary(): Promise<Kse100Summary> {
  try {
    const liveRows = await fetchRowsFromApi();
    const liveSummary = deriveKse100SummaryFromRows(liveRows);

    if (!liveSummary) {
      throw new Error("Unable to derive KSE-100 summary from live data");
    }

    await writeRowsToCache(liveRows);

    return {
      ...liveSummary,
      source: "live",
    };
  } catch {
    const cachedSummary = await getCachedKse100Summary();
    if (cachedSummary) {
      return cachedSummary;
    }

    return getLatestKse100SummaryMock();
  }
}

export function getInsightDisplayValue(
  symbol: string,
  mode: InsightDisplayMode,
  fallbackValueText: string
): string {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const valuesBySymbol = HOME_INSIGHT_DISPLAY_VALUES[normalizedSymbol];

  if (!valuesBySymbol) {
    return fallbackValueText;
  }

  return mode === "price" ? valuesBySymbol.price : valuesBySymbol.percentage;
}
