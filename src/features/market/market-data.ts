import * as FileSystem from "expo-file-system/legacy";

export type MarketEndpointType = "int" | "eod";
type MarketSource = "live" | "cache" | "fallback";
type ConstituentsSource = "live" | "cache" | "fallback";

export type MarketIndexDefinition = {
  code: string;
  displayCode: string;
  name: string;
  endpointType: MarketEndpointType;
};

type MarketTimeseriesRow = {
  timestamp: number;
  price: number;
  volume: number;
};

type MarketEodRow = {
  timestamp: number;
  closePrice: number;
  volume: number;
  openPrice: number;
};

export type MarketIndexSnapshot = {
  code: string;
  displayCode: string;
  name: string;
  highPrice: number;
  lowPrice: number;
  volume: number;
  value: number;
  latestPrice: number;
  change: number;
  changePct: number;
  asOf: string | null;
  source: MarketSource;
};

export type MarketIndexDetailSnapshot = {
  snapshot: MarketIndexSnapshot;
  volume: number;
  valueTraded: number;
  openPrice: number;
  lastDayClose: number;
  dayLow: number;
  dayHigh: number;
  week52Low: number;
  week52High: number;
};

export type MarketIndexConstituent = {
  symbol: string;
  name: string;
  ldcp: number;
  current: number;
  change: number;
  changePct: number;
  idxWeightPct: number;
  idxPoint: number;
  volume: number;
  freeFloatM: number;
  marketCapM: number;
  trend: "up" | "down" | "flat";
};

export type MarketIndexConstituentSnapshot = {
  indexCode: string;
  endpointCode: string | null;
  asOf: string | null;
  items: MarketIndexConstituent[];
  source: ConstituentsSource;
};

type MarketSnapshotStore = {
  version: 1;
  updatedAt: string;
  items: MarketIndexSnapshot[];
};

type ConstituentsCacheEntry = {
  asOf: string;
  endpointCode: string;
  items: MarketIndexConstituent[];
};

type ConstituentsCacheStore = {
  version: 1;
  updatedAt: string;
  byCode: Record<string, ConstituentsCacheEntry>;
};

const PSX_TIMESERIES_BASE_URL = "https://dps.psx.com.pk/timeseries";
const PSX_INDICES_BASE_URL = "https://dps.psx.com.pk/indices";

const MARKET_INDEX_DEFINITIONS: MarketIndexDefinition[] = [
  { code: "KSE100", displayCode: "KSE100", name: "KSE 100 INDEX", endpointType: "int" },
  {
    code: "ALLSHR",
    displayCode: "KSEALL",
    name: "KSE ALL SHARE INDEX",
    endpointType: "int",
  },
  { code: "KSE30", displayCode: "KSE30", name: "KSE 30 INDEX", endpointType: "int" },
  { code: "KMI30", displayCode: "KMI30", name: "KMI 30 INDEX", endpointType: "int" },
  { code: "MII30", displayCode: "MII30", name: "MII 30 INDEX", endpointType: "int" },
  {
    code: "KMIALLSHR",
    displayCode: "KMIALL",
    name: "ALL ISLAMIC SHARES INDEX",
    endpointType: "int",
  },
  {
    code: "PSXDIV20",
    displayCode: "PSXDIV20",
    name: "PSX DIVIDEND 20 INDEX",
    endpointType: "int",
  },
  {
    code: "BKTI",
    displayCode: "BKTI",
    name: "BANKING TRADABLE INDEX",
    endpointType: "int",
  },
  {
    code: "OGTI",
    displayCode: "OGTI",
    name: "OIL & GAS TRADABLE INDEX",
    endpointType: "int",
  },
  { code: "UPP9", displayCode: "UPP9", name: "UPP9 INDEX", endpointType: "int" },
  { code: "NITPGI", displayCode: "NITPGI", name: "NITPGI INDEX", endpointType: "int" },
  { code: "NBPPGI", displayCode: "NBPPGI", name: "NBPPGI INDEX", endpointType: "int" },
  { code: "MZNPI", displayCode: "MZNPI", name: "MZNPI INDEX", endpointType: "int" },
  { code: "JSMFI", displayCode: "JSMFI", name: "JSMFI INDEX", endpointType: "int" },
  { code: "ACI", displayCode: "ACI", name: "ACI INDEX", endpointType: "int" },
  {
    code: "JSGBKTI",
    displayCode: "JSGBKTI",
    name: "JSG BKTI INDEX",
    endpointType: "int",
  },
  { code: "HBLTTI", displayCode: "HBLTTI", name: "HBL TTI INDEX", endpointType: "eod" },
];

const MARKET_CACHE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-market-indices-cache.json`
  : null;
const MARKET_CONSTITUENTS_CACHE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-market-constituents-cache.json`
  : null;

const INDEX_CONSTITUENT_ENDPOINT_CANDIDATES: Record<string, string[]> = {
  KSE100: ["KSE100PR", "KSE100"],
  ALLSHR: ["KSEALL", "ALLSHR"],
  KSE30: ["KSE30"],
  KMI30: ["KMI30"],
  MII30: ["MII30"],
  KMIALLSHR: ["KMIALLSHR", "KMIALL"],
  PSXDIV20: ["PSXDIV20"],
  BKTI: ["BKTI"],
  OGTI: ["OGTI"],
  UPP9: ["UPP9"],
  NITPGI: ["NITPGI"],
  NBPPGI: ["NBPPGI"],
  MZNPI: ["MZNPI"],
  JSMFI: ["JSMFI"],
  ACI: ["ACI"],
  JSGBKTI: ["JSGBKTI"],
  HBLTTI: ["HBLTTI"],
};

function getFallbackSnapshot(
  definition: MarketIndexDefinition,
  source: MarketSource = "fallback"
): MarketIndexSnapshot {
  return {
    code: definition.code,
    displayCode: definition.displayCode,
    name: definition.name,
    highPrice: 0,
    lowPrice: 0,
    volume: 0,
    value: 0,
    latestPrice: 0,
    change: 0,
    changePct: 0,
    asOf: null,
    source,
  };
}

function getFallbackConstituentSnapshot(
  code: string,
  source: ConstituentsSource = "fallback"
): MarketIndexConstituentSnapshot {
  return {
    indexCode: code,
    endpointCode: null,
    asOf: null,
    items: [],
    source,
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(stripHtmlTags(value)).replace(/\s+/g, " ").trim();
}

function parseNumberText(value: string): number {
  const normalized = normalizeText(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();
  if (normalized.length === 0) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumberFromCell(cellHtml: string): number {
  const dataOrderMatch = cellHtml.match(/data-order\s*=\s*"([^"]+)"/i);
  if (dataOrderMatch && dataOrderMatch[1]) {
    const parsed = Number.parseFloat(dataOrderMatch[1].replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return parseNumberText(cellHtml);
}

function parseSymbolFromCell(cellHtml: string): string {
  const dataOrderMatch = cellHtml.match(/data-order\s*=\s*"([^"]+)"/i);
  if (dataOrderMatch && dataOrderMatch[1]) {
    return dataOrderMatch[1].trim().toUpperCase();
  }

  const text = normalizeText(cellHtml);
  if (text.length === 0) {
    return "";
  }

  const symbolToken = text.split(" ")[0] ?? "";
  return symbolToken.trim().toUpperCase();
}

function normalizeRows(rawRows: unknown): MarketTimeseriesRow[] {
  if (!Array.isArray(rawRows)) {
    return [];
  }

  return rawRows
    .filter((row) => Array.isArray(row) && row.length >= 3)
    .map((row) => {
      const typedRow = row as unknown[];
      return {
        timestamp:
          typeof typedRow[0] === "number" && Number.isFinite(typedRow[0])
            ? typedRow[0]
            : 0,
        price:
          typeof typedRow[1] === "number" && Number.isFinite(typedRow[1])
            ? typedRow[1]
            : 0,
        volume:
          typeof typedRow[2] === "number" && Number.isFinite(typedRow[2])
            ? typedRow[2]
            : 0,
      };
    })
    .filter(
      (row) =>
        row.timestamp > 0 &&
        Number.isFinite(row.price) &&
        row.price >= 0 &&
        Number.isFinite(row.volume) &&
        row.volume >= 0
    )
    .sort((firstRow, secondRow) => secondRow.timestamp - firstRow.timestamp);
}

function normalizeEodRows(rawRows: unknown): MarketEodRow[] {
  if (!Array.isArray(rawRows)) {
    return [];
  }

  return rawRows
    .filter((row) => Array.isArray(row) && row.length >= 4)
    .map((row) => {
      const typedRow = row as unknown[];
      return {
        timestamp:
          typeof typedRow[0] === "number" && Number.isFinite(typedRow[0])
            ? typedRow[0]
            : 0,
        closePrice:
          typeof typedRow[1] === "number" && Number.isFinite(typedRow[1])
            ? typedRow[1]
            : 0,
        volume:
          typeof typedRow[2] === "number" && Number.isFinite(typedRow[2])
            ? typedRow[2]
            : 0,
        openPrice:
          typeof typedRow[3] === "number" && Number.isFinite(typedRow[3])
            ? typedRow[3]
            : 0,
      };
    })
    .filter(
      (row) =>
        row.timestamp > 0 &&
        Number.isFinite(row.closePrice) &&
        row.closePrice >= 0 &&
        Number.isFinite(row.volume) &&
        row.volume >= 0 &&
        Number.isFinite(row.openPrice) &&
        row.openPrice >= 0
    )
    .sort((firstRow, secondRow) => secondRow.timestamp - firstRow.timestamp);
}

function mapEodRowsToTimeseriesRows(rows: MarketEodRow[]): MarketTimeseriesRow[] {
  return rows.map((row) => ({
    timestamp: row.timestamp,
    price: row.closePrice,
    volume: row.volume,
  }));
}

function getDayKeyFromEpochSeconds(timestamp: number): number {
  return Math.floor(timestamp / 86_400);
}

function getPreviousCloseFromTimeseriesRows(rows: MarketTimeseriesRow[]): number | null {
  if (rows.length < 2) {
    return null;
  }

  const latestDayKey = getDayKeyFromEpochSeconds(rows[0].timestamp);
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) {
      continue;
    }

    const rowDayKey = getDayKeyFromEpochSeconds(row.timestamp);
    if (rowDayKey < latestDayKey && Number.isFinite(row.price) && row.price > 0) {
      return row.price;
    }
  }

  return null;
}

function getPreviousCloseFromEodRows(
  rows: MarketEodRow[],
  latestTimeseriesTimestamp: number
): number | null {
  if (rows.length === 0 || latestTimeseriesTimestamp <= 0) {
    return null;
  }

  const latestDayKey = getDayKeyFromEpochSeconds(latestTimeseriesTimestamp);
  for (const row of rows) {
    const rowDayKey = getDayKeyFromEpochSeconds(row.timestamp);
    if (rowDayKey < latestDayKey && Number.isFinite(row.closePrice) && row.closePrice > 0) {
      return row.closePrice;
    }
  }

  return null;
}

function parseConstituentRowsFromHtml(html: string): MarketIndexConstituent[] {
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch || !tbodyMatch[1]) {
    return [];
  }

  const rowMatches = tbodyMatch[1].match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  return rowMatches
    .map((rowHtml) => {
      const cellMatches = rowHtml.match(/<td\b[\s\S]*?<\/td>/gi) ?? [];
      if (cellMatches.length < 11) {
        return null;
      }

      const symbol = parseSymbolFromCell(cellMatches[0]!);
      if (symbol.length === 0) {
        return null;
      }

      const change = parseNumberFromCell(cellMatches[4]!);
      let trend: "up" | "down" | "flat" = "flat";
      if (change > 0) {
        trend = "up";
      } else if (change < 0) {
        trend = "down";
      }

      return {
        symbol,
        name: normalizeText(cellMatches[1]!),
        ldcp: parseNumberFromCell(cellMatches[2]!),
        current: parseNumberFromCell(cellMatches[3]!),
        change,
        changePct: parseNumberFromCell(cellMatches[5]!),
        idxWeightPct: parseNumberFromCell(cellMatches[6]!),
        idxPoint: parseNumberFromCell(cellMatches[7]!),
        volume: parseNumberFromCell(cellMatches[8]!),
        freeFloatM: parseNumberFromCell(cellMatches[9]!),
        marketCapM: parseNumberFromCell(cellMatches[10]!),
        trend,
      } satisfies MarketIndexConstituent;
    })
    .filter((item): item is MarketIndexConstituent => item !== null);
}

function getConstituentEndpointCandidates(code: string): string[] {
  const normalizedCode = code.trim().toUpperCase();
  const fromMap = INDEX_CONSTITUENT_ENDPOINT_CANDIDATES[normalizedCode] ?? [];
  const candidates = [...fromMap, normalizedCode]
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length > 0);

  return [...new Set(candidates)];
}

function toSnapshot(
  definition: MarketIndexDefinition,
  rows: MarketTimeseriesRow[],
  source: MarketSource,
  previousCloseOverride?: number | null
): MarketIndexSnapshot {
  if (rows.length === 0) {
    return getFallbackSnapshot(definition, source);
  }

  const latestRow = rows[0];
  const previousRow = rows[1] ?? latestRow;
  const highPrice = rows.reduce(
    (runningHigh, row) => (row.price > runningHigh ? row.price : runningHigh),
    rows[0].price
  );
  const lowPrice = rows.reduce(
    (runningLow, row) => (row.price < runningLow ? row.price : runningLow),
    rows[0].price
  );
  const volume = rows.reduce((runningVolume, row) => runningVolume + row.volume, 0);
  const value = latestRow.price * latestRow.volume;
  const latestPrice = latestRow.price;
  const previousClose =
    typeof previousCloseOverride === "number" &&
    Number.isFinite(previousCloseOverride) &&
    previousCloseOverride > 0
      ? previousCloseOverride
      : getPreviousCloseFromTimeseriesRows(rows) ?? previousRow.price;
  const change = latestPrice - previousClose;
  const changePct = previousClose === 0 ? 0 : (change / previousClose) * 100;

  return {
    code: definition.code,
    displayCode: definition.displayCode,
    name: definition.name,
    highPrice,
    lowPrice,
    volume,
    value,
    latestPrice,
    change,
    changePct,
    asOf: new Date(latestRow.timestamp * 1000).toISOString(),
    source,
  };
}

function getSafeStore(rawValue: unknown): MarketSnapshotStore {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }

  const parsedStore = rawValue as Partial<MarketSnapshotStore>;
  const validItems = Array.isArray(parsedStore.items)
    ? parsedStore.items.filter(
        (item): item is MarketIndexSnapshot =>
          Boolean(item) &&
          typeof item.code === "string" &&
          typeof item.displayCode === "string" &&
          typeof item.name === "string" &&
          typeof item.highPrice === "number" &&
          typeof item.lowPrice === "number" &&
          typeof item.volume === "number" &&
          typeof item.value === "number" &&
          typeof item.latestPrice === "number" &&
          typeof item.change === "number" &&
          typeof item.changePct === "number" &&
          (item.source === "live" || item.source === "cache" || item.source === "fallback") &&
          (typeof item.asOf === "string" || item.asOf === null)
      )
    : [];

  return {
    version: 1,
    updatedAt:
      typeof parsedStore.updatedAt === "string"
        ? parsedStore.updatedAt
        : new Date().toISOString(),
    items: validItems,
  };
}

async function readStore(): Promise<MarketSnapshotStore> {
  if (!MARKET_CACHE_FILE_URI) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }

  try {
    const rawStore = await FileSystem.readAsStringAsync(MARKET_CACHE_FILE_URI);
    return getSafeStore(JSON.parse(rawStore));
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }
}

async function writeStore(store: MarketSnapshotStore): Promise<void> {
  if (!MARKET_CACHE_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(MARKET_CACHE_FILE_URI, JSON.stringify(store));
}

function getSafeConstituentsStore(rawValue: unknown): ConstituentsCacheStore {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      byCode: {},
    };
  }

  const parsedStore = rawValue as Partial<ConstituentsCacheStore>;
  const rawByCode =
    parsedStore.byCode && typeof parsedStore.byCode === "object" && !Array.isArray(parsedStore.byCode)
      ? parsedStore.byCode
      : {};

  const byCodeEntries = Object.entries(rawByCode).flatMap(([code, entry]) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const typedEntry = entry as Partial<ConstituentsCacheEntry>;
    if (typeof typedEntry.endpointCode !== "string" || !Array.isArray(typedEntry.items)) {
      return [];
    }

    const items = typedEntry.items
      .filter(
        (item): item is MarketIndexConstituent =>
          Boolean(item) &&
          typeof item.symbol === "string" &&
          typeof item.name === "string" &&
          typeof item.ldcp === "number" &&
          typeof item.current === "number" &&
          typeof item.change === "number" &&
          typeof item.changePct === "number" &&
          typeof item.idxWeightPct === "number" &&
          typeof item.idxPoint === "number" &&
          typeof item.volume === "number" &&
          typeof item.freeFloatM === "number" &&
          typeof item.marketCapM === "number" &&
          (item.trend === "up" || item.trend === "down" || item.trend === "flat")
      )
      .map((item) => ({
        ...item,
        symbol: item.symbol.trim().toUpperCase(),
      }));

    return [
      [
        code.trim().toUpperCase(),
        {
          asOf:
            typeof typedEntry.asOf === "string"
              ? typedEntry.asOf
              : new Date().toISOString(),
          endpointCode: typedEntry.endpointCode.trim().toUpperCase(),
          items,
        } satisfies ConstituentsCacheEntry,
      ] as const,
    ];
  });

  return {
    version: 1,
    updatedAt:
      typeof parsedStore.updatedAt === "string"
        ? parsedStore.updatedAt
        : new Date().toISOString(),
    byCode: Object.fromEntries(byCodeEntries),
  };
}

async function readConstituentsStore(): Promise<ConstituentsCacheStore> {
  if (!MARKET_CONSTITUENTS_CACHE_FILE_URI) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      byCode: {},
    };
  }

  try {
    const rawStore = await FileSystem.readAsStringAsync(MARKET_CONSTITUENTS_CACHE_FILE_URI);
    return getSafeConstituentsStore(JSON.parse(rawStore));
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      byCode: {},
    };
  }
}

async function writeConstituentsStore(store: ConstituentsCacheStore): Promise<void> {
  if (!MARKET_CONSTITUENTS_CACHE_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(
    MARKET_CONSTITUENTS_CACHE_FILE_URI,
    JSON.stringify(store)
  );
}

async function fetchRowsFromApi(
  definition: MarketIndexDefinition
): Promise<MarketTimeseriesRow[]> {
  return fetchTimeseriesRowsFromApi(definition.code, definition.endpointType);
}

async function fetchConstituentRowsFromApi(
  endpointCode: string
): Promise<MarketIndexConstituent[]> {
  const endpointUrl = `${PSX_INDICES_BASE_URL}/${encodeURIComponent(endpointCode)}`;
  const response = await fetch(endpointUrl, {
    headers: {
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Indices endpoint failed for ${endpointCode} with status ${response.status}`
    );
  }

  const html = await response.text();
  const parsedItems = parseConstituentRowsFromHtml(html);
  if (parsedItems.length === 0) {
    throw new Error(`Indices endpoint returned empty rows for ${endpointCode}`);
  }

  return parsedItems;
}

async function fetchTimeseriesRowsFromApi(
  code: string,
  endpointType: MarketEndpointType
): Promise<MarketTimeseriesRow[]> {
  const endpointUrl = `${PSX_TIMESERIES_BASE_URL}/${endpointType}/${encodeURIComponent(code)}`;
  const response = await fetch(endpointUrl, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Market endpoint failed for ${code} with status ${response.status}`
    );
  }

  const payload = (await response.json()) as {
    status?: unknown;
    data?: unknown;
  };

  if (typeof payload.status === "number" && payload.status !== 1) {
    throw new Error(`Market endpoint returned non-success status for ${code}`);
  }

  const rows = normalizeRows(payload.data);
  if (rows.length === 0) {
    throw new Error(`Market endpoint returned empty rows for ${code}`);
  }

  return rows;
}

async function fetchEodRowsFromApi(code: string): Promise<MarketEodRow[]> {
  const endpointUrl = `${PSX_TIMESERIES_BASE_URL}/eod/${encodeURIComponent(code)}`;
  const response = await fetch(endpointUrl, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Market endpoint failed for ${code} with status ${response.status}`
    );
  }

  const payload = (await response.json()) as {
    status?: unknown;
    data?: unknown;
  };

  if (typeof payload.status === "number" && payload.status !== 1) {
    throw new Error(`Market endpoint returned non-success status for ${code}`);
  }

  const rows = normalizeEodRows(payload.data);
  if (rows.length === 0) {
    throw new Error(`Market endpoint returned empty rows for ${code}`);
  }

  return rows;
}

function getMarketIndexDefinitionByCodeInternal(
  code: string
): MarketIndexDefinition | null {
  const normalizedCode = code.trim().toUpperCase();
  if (normalizedCode.length === 0) {
    return null;
  }

  return (
    MARKET_INDEX_DEFINITIONS.find((definition) => definition.code === normalizedCode) ??
    null
  );
}

async function upsertCachedSnapshot(snapshot: MarketIndexSnapshot): Promise<void> {
  const store = await readStore();
  const byCode = new Map(store.items.map((item) => [item.code, item]));
  byCode.set(snapshot.code, snapshot);

  const nextStore: MarketSnapshotStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: MARKET_INDEX_DEFINITIONS.map((definition) => {
      const storedItem = byCode.get(definition.code);
      return storedItem ?? getFallbackSnapshot(definition, "fallback");
    }),
  };

  await writeStore(nextStore);
}

async function upsertConstituentsCache(
  snapshot: MarketIndexConstituentSnapshot
): Promise<void> {
  const store = await readConstituentsStore();
  const normalizedCode = snapshot.indexCode.trim().toUpperCase();
  const normalizedEndpointCode =
    snapshot.endpointCode?.trim().toUpperCase() ?? normalizedCode;

  const nextStore: ConstituentsCacheStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    byCode: {
      ...store.byCode,
      [normalizedCode]: {
        asOf: snapshot.asOf ?? new Date().toISOString(),
        endpointCode: normalizedEndpointCode,
        items: snapshot.items.map((item) => ({
          ...item,
          symbol: item.symbol.trim().toUpperCase(),
        })),
      },
    },
  };

  await writeConstituentsStore(nextStore);
}

function buildMarketIndexDetail(
  snapshot: MarketIndexSnapshot,
  eodRows: MarketEodRow[]
): MarketIndexDetailSnapshot {
  const openPrice =
    eodRows.length > 0 && Number.isFinite(eodRows[0].openPrice)
      ? eodRows[0].openPrice
      : snapshot.latestPrice - snapshot.change;
  const lastDayClose =
    eodRows.length > 1 && Number.isFinite(eodRows[1].closePrice)
      ? eodRows[1].closePrice
      : snapshot.latestPrice - snapshot.change;

  const nowTimestamp = Date.now();
  const week52StartTimestamp = nowTimestamp - 52 * 7 * 24 * 60 * 60 * 1000;
  const week52Rows = eodRows.filter(
    (row) => row.timestamp * 1000 >= week52StartTimestamp
  );
  const week52SourceRows = week52Rows.length > 0 ? week52Rows : eodRows;
  const week52CloseValues = week52SourceRows.map((row) => row.closePrice);
  const week52Low =
    week52CloseValues.length > 0
      ? Math.min(...week52CloseValues)
      : snapshot.lowPrice;
  const week52High =
    week52CloseValues.length > 0
      ? Math.max(...week52CloseValues)
      : snapshot.highPrice;

  return {
    snapshot,
    volume: snapshot.volume,
    valueTraded: snapshot.value,
    openPrice: Number.isFinite(openPrice) ? openPrice : 0,
    lastDayClose: Number.isFinite(lastDayClose) ? lastDayClose : 0,
    dayLow: snapshot.lowPrice,
    dayHigh: snapshot.highPrice,
    week52Low,
    week52High,
  };
}

export function getMarketIndexDefinitions(): MarketIndexDefinition[] {
  return [...MARKET_INDEX_DEFINITIONS];
}

export function getMarketIndexDefinitionByCode(
  code: string
): MarketIndexDefinition | null {
  return getMarketIndexDefinitionByCodeInternal(code);
}

export async function getCachedMarketSnapshot(): Promise<MarketIndexSnapshot[]> {
  const store = await readStore();
  const byCode = new Map(
    store.items.map((item) => [
      item.code.trim().toUpperCase(),
      {
        ...item,
        source: item.source === "live" ? ("cache" as const) : item.source,
      },
    ])
  );

  return MARKET_INDEX_DEFINITIONS.map((definition) => {
    const cachedItem = byCode.get(definition.code);
    return cachedItem ?? getFallbackSnapshot(definition, "fallback");
  });
}

export async function getLatestMarketSnapshot(): Promise<MarketIndexSnapshot[]> {
  const cachedItems = await getCachedMarketSnapshot();
  const cachedByCode = new Map(cachedItems.map((item) => [item.code, item]));

  const latestItems = await Promise.all(
    MARKET_INDEX_DEFINITIONS.map(async (definition) => {
      try {
        if (definition.endpointType === "eod") {
          const rows = await fetchRowsFromApi(definition);
          return toSnapshot(definition, rows, "live");
        }

        const [intradayRows, eodRows] = await Promise.all([
          fetchTimeseriesRowsFromApi(definition.code, "int"),
          fetchEodRowsFromApi(definition.code).catch(() => []),
        ]);
        const previousCloseFromEod =
          intradayRows.length > 0
            ? getPreviousCloseFromEodRows(eodRows, intradayRows[0].timestamp)
            : null;

        return toSnapshot(definition, intradayRows, "live", previousCloseFromEod);
      } catch {
        const cachedItem = cachedByCode.get(definition.code);
        return cachedItem ?? getFallbackSnapshot(definition, "fallback");
      }
    })
  );

  const nextStore: MarketSnapshotStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: latestItems,
  };
  await writeStore(nextStore);

  return latestItems;
}

export async function getCachedMarketIndexDetail(
  code: string
): Promise<MarketIndexDetailSnapshot | null> {
  const definition = getMarketIndexDefinitionByCodeInternal(code);
  if (!definition) {
    return null;
  }

  const cachedSnapshot = (
    await getCachedMarketSnapshot()
  ).find((snapshot) => snapshot.code === definition.code);
  const snapshot = cachedSnapshot ?? getFallbackSnapshot(definition, "fallback");
  return buildMarketIndexDetail(snapshot, []);
}

export async function getLatestMarketIndexDetail(
  code: string
): Promise<MarketIndexDetailSnapshot | null> {
  const definition = getMarketIndexDefinitionByCodeInternal(code);
  if (!definition) {
    return null;
  }

  const cachedDetail = await getCachedMarketIndexDetail(definition.code);

  try {
    const [intradayRows, eodRows] = await Promise.all([
      fetchTimeseriesRowsFromApi(definition.code, "int").catch(() => []),
      fetchEodRowsFromApi(definition.code).catch(() => []),
    ]);
    const normalizedEodRows = eodRows;
    const eodAsTimeseries = mapEodRowsToTimeseriesRows(normalizedEodRows);
    const primaryRows =
      intradayRows.length > 0
        ? intradayRows
        : eodAsTimeseries.length > 0
          ? eodAsTimeseries
          : [];

    if (primaryRows.length === 0) {
      return cachedDetail;
    }

    const previousCloseFromEod =
      primaryRows.length > 0
        ? getPreviousCloseFromEodRows(normalizedEodRows, primaryRows[0].timestamp)
        : null;
    const snapshot = toSnapshot(
      definition,
      primaryRows,
      "live",
      previousCloseFromEod
    );
    await upsertCachedSnapshot(snapshot);
    return buildMarketIndexDetail(snapshot, normalizedEodRows);
  } catch {
    return cachedDetail;
  }
}

export async function getCachedMarketIndexConstituents(
  code: string
): Promise<MarketIndexConstituentSnapshot | null> {
  const definition = getMarketIndexDefinitionByCodeInternal(code);
  if (!definition) {
    return null;
  }

  const store = await readConstituentsStore();
  const cachedEntry = store.byCode[definition.code];
  if (!cachedEntry) {
    return getFallbackConstituentSnapshot(definition.code);
  }

  return {
    indexCode: definition.code,
    endpointCode: cachedEntry.endpointCode,
    asOf: cachedEntry.asOf,
    items: cachedEntry.items,
    source: "cache",
  };
}

export async function getLatestMarketIndexConstituents(
  code: string
): Promise<MarketIndexConstituentSnapshot | null> {
  const definition = getMarketIndexDefinitionByCodeInternal(code);
  if (!definition) {
    return null;
  }

  const cachedSnapshot =
    (await getCachedMarketIndexConstituents(definition.code)) ??
    getFallbackConstituentSnapshot(definition.code);
  const endpointCandidates = getConstituentEndpointCandidates(definition.code);

  for (const endpointCode of endpointCandidates) {
    try {
      const liveItems = await fetchConstituentRowsFromApi(endpointCode);
      const liveSnapshot: MarketIndexConstituentSnapshot = {
        indexCode: definition.code,
        endpointCode,
        asOf: new Date().toISOString(),
        items: liveItems,
        source: "live",
      };
      await upsertConstituentsCache(liveSnapshot);
      return liveSnapshot;
    } catch {
      // Try next candidate endpoint code.
    }
  }

  return cachedSnapshot;
}
