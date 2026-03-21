import * as FileSystem from "expo-file-system/legacy";

const PSX_BASE_URL = "https://dps.psx.com.pk";
const DEFAULT_FETCH_COUNT = 25;

const ANNOUNCEMENT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const PSX_ANNOUNCEMENT_SOURCE_KEYS = [
  "psxNotices",
  "companyAnnouncements",
  "corporateBriefingSessions",
  "cdcNotices",
  "secpNotices",
  "nccplNotices",
  "agmEogmCalendar",
  "payouts",
  "gisAuctionResults",
] as const;

const ANNOUNCEMENT_TYPE_BY_SOURCE: Partial<
  Record<PsxAnnouncementSourceKey, "A" | "B" | "C" | "D" | "E">
> = {
  psxNotices: "E",
  companyAnnouncements: "C",
  cdcNotices: "A",
  secpNotices: "B",
  nccplNotices: "D",
};

export type PsxAnnouncementSourceKey =
  (typeof PSX_ANNOUNCEMENT_SOURCE_KEYS)[number];

export type PsxAnnouncementSourceDefinition = {
  key: PsxAnnouncementSourceKey;
  label: string;
};

export type PsxAnnouncementSourceType = "live" | "cache" | "fallback";

export type PsxAnnouncementItem = {
  id: string;
  sourceKey: PsxAnnouncementSourceKey;
  sourceLabel: string;
  title: string;
  summary: string;
  symbol: string | null;
  companyName: string | null;
  dateLabel: string;
  timeLabel: string | null;
  occurredAt: string | null;
  pdfUrl: string | null;
};

export type PsxAnnouncementSnapshot = {
  sourceKey: PsxAnnouncementSourceKey;
  sourceLabel: string;
  asOf: string | null;
  items: PsxAnnouncementItem[];
  source: PsxAnnouncementSourceType;
};

type CalendarEvent = {
  id: number;
  symbol: string;
  name: string;
  type: string;
  date: string;
  time: string;
  city: string;
  period_end: string;
};

type CalendarResponse = {
  status: number;
  message: string;
  data?: CalendarEvent[];
};

type ParsedTableRow = {
  cellsHtml: string[];
};

type AnnouncementCacheEntry = {
  asOf: string;
  items: PsxAnnouncementItem[];
};

type AnnouncementCacheStore = {
  version: 1;
  updatedAt: string;
  bySource: Partial<Record<PsxAnnouncementSourceKey, AnnouncementCacheEntry>>;
};

const ANNOUNCEMENT_SOURCE_DEFINITIONS: PsxAnnouncementSourceDefinition[] = [
  { key: "psxNotices", label: "PSX Notices" },
  { key: "companyAnnouncements", label: "Company Announcements" },
  { key: "corporateBriefingSessions", label: "Corporate Briefing Sessions (CBS)" },
  { key: "cdcNotices", label: "CDC Notices" },
  { key: "secpNotices", label: "SECP Notices" },
  { key: "nccplNotices", label: "NCCPL Notices" },
  { key: "agmEogmCalendar", label: "AGM/EOGM Calendar" },
  { key: "payouts", label: "Payouts" },
  { key: "gisAuctionResults", label: "GIS Auction Results" },
];

const ANNOUNCEMENTS_CACHE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-announcements-cache.json`
  : null;

let latestAnnouncementFetchTimestamp = 0;

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function normalizeSymbol(symbol: string | null): string | null {
  if (!symbol) {
    return null;
  }

  const normalized = symbol.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
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

function isPsxAnnouncementSourceKey(
  value: string,
): value is PsxAnnouncementSourceKey {
  return (PSX_ANNOUNCEMENT_SOURCE_KEYS as readonly string[]).includes(value);
}

function getSourceLabel(sourceKey: PsxAnnouncementSourceKey): string {
  const sourceDefinition = ANNOUNCEMENT_SOURCE_DEFINITIONS.find(
    (item) => item.key === sourceKey,
  );

  return sourceDefinition?.label ?? "PSX Announcements";
}

function toAbsolutePsxUrl(pathOrUrl: string): string {
  const normalized = pathOrUrl.trim();
  if (normalized.length === 0) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("//")) {
    return `https:${normalized}`;
  }

  if (normalized.startsWith("/")) {
    return `${PSX_BASE_URL}${normalized}`;
  }

  return `${PSX_BASE_URL}/${normalized}`;
}

function extractTableHtml(html: string, sourceKey: PsxAnnouncementSourceKey): string | null {
  if (sourceKey === "gisAuctionResults") {
    const gisTableMatch = html.match(
      /<div[^>]*id="gisAuction"[\s\S]*?<table\b[\s\S]*?<\/table>/i,
    );
    if (gisTableMatch && gisTableMatch[0]) {
      return gisTableMatch[0];
    }
  }

  const idCandidates = ["announcementsTable", "announcementTable"];
  for (const idCandidate of idCandidates) {
    const regex = new RegExp(
      `<table\\b[^>]*id=["']${idCandidate}["'][^>]*>[\\s\\S]*?<\\/table>`,
      "i",
    );
    const matched = html.match(regex);
    if (matched && matched[0]) {
      return matched[0];
    }
  }

  const fallbackMatch = html.match(/<table\b[^>]*class=["'][^"']*tbl[^"']*["'][^>]*>[\s\S]*?<\/table>/i);
  return fallbackMatch?.[0] ?? null;
}

function parseTableRowsFromHtml(html: string, sourceKey: PsxAnnouncementSourceKey): ParsedTableRow[] {
  const tableHtml = extractTableHtml(html, sourceKey);
  if (!tableHtml) {
    return [];
  }

  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const tableBodyHtml = tbodyMatch?.[1] ?? tableHtml;
  const rowMatches = tableBodyHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  return rowMatches
    .map((rowHtml) => {
      const cellMatches = rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) ?? [];
      return {
        cellsHtml: cellMatches,
      };
    })
    .filter((row) => row.cellsHtml.length > 0);
}

function parseDateToIso(dateText: string, timeText?: string | null): string | null {
  const normalizedDate = dateText.trim();
  const normalizedTime = timeText?.trim() ?? "";
  if (normalizedDate.length === 0) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    const normalizedDateTime =
      normalizedTime.length > 0
        ? `${normalizedDate}T${normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime}`
        : `${normalizedDate}T00:00:00`;
    const parsed = new Date(normalizedDateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(
    `${normalizedDate}${normalizedTime.length > 0 ? ` ${normalizedTime}` : ""}`,
  );
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function extractSymbolFromCell(cellHtml: string): string | null {
  const dataOrderMatch = cellHtml.match(/data-order\s*=\s*["']([^"']+)["']/i);
  if (dataOrderMatch?.[1]) {
    return normalizeSymbol(dataOrderMatch[1]);
  }

  const strongMatch = cellHtml.match(/<strong>([\s\S]*?)<\/strong>/i);
  if (strongMatch?.[1]) {
    return normalizeSymbol(normalizeText(strongMatch[1]));
  }

  const cellText = normalizeText(cellHtml);
  if (cellText.length === 0) {
    return null;
  }

  const symbolMatch = cellText.match(/[A-Za-z0-9.\-]{2,15}/);
  return normalizeSymbol(symbolMatch?.[0] ?? "");
}

function extractSymbolFromTitle(title: string): string | null {
  const titleMatch = title.match(/\(([A-Z0-9.\-]{2,15})\)\s*$/);
  if (titleMatch?.[1]) {
    return normalizeSymbol(titleMatch[1]);
  }

  return null;
}

function extractPdfUrlFromCell(cellHtml: string): string | null {
  const anchorMatches = Array.from(
    cellHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi),
  );

  for (const anchorMatch of anchorMatches) {
    const href = anchorMatch[1] ?? "";
    if (/\.pdf($|\?)/i.test(href) || href.includes("/download/")) {
      const absoluteUrl = toAbsolutePsxUrl(href);
      return absoluteUrl.length > 0 ? absoluteUrl : null;
    }
  }

  return null;
}

function buildAnnouncementItem(params: {
  sourceKey: PsxAnnouncementSourceKey;
  sourceLabel: string;
  title: string;
  summary: string;
  symbol: string | null;
  companyName: string | null;
  dateLabel: string;
  timeLabel: string | null;
  occurredAt: string | null;
  pdfUrl: string | null;
}): PsxAnnouncementItem {
  const idSeed = [
    params.sourceKey,
    params.symbol ?? "",
    params.title,
    params.dateLabel,
    params.timeLabel ?? "",
    params.pdfUrl ?? "",
  ].join("|");

  return {
    id: `${params.sourceKey}-${hashString(idSeed)}`,
    sourceKey: params.sourceKey,
    sourceLabel: params.sourceLabel,
    title: params.title,
    summary: params.summary,
    symbol: params.symbol,
    companyName: params.companyName,
    dateLabel: params.dateLabel,
    timeLabel: params.timeLabel,
    occurredAt: params.occurredAt,
    pdfUrl: params.pdfUrl,
  };
}

function sortAnnouncementItems(items: PsxAnnouncementItem[]): PsxAnnouncementItem[] {
  return [...items].sort((firstItem, secondItem) => {
    const firstTime = firstItem.occurredAt
      ? new Date(firstItem.occurredAt).getTime()
      : Number.NEGATIVE_INFINITY;
    const secondTime = secondItem.occurredAt
      ? new Date(secondItem.occurredAt).getTime()
      : Number.NEGATIVE_INFINITY;

    if (firstTime === secondTime) {
      return secondItem.id.localeCompare(firstItem.id);
    }

    return secondTime - firstTime;
  });
}

function parseAnnouncementRowsToItems(
  sourceKey: PsxAnnouncementSourceKey,
  sourceLabel: string,
  rows: ParsedTableRow[],
): PsxAnnouncementItem[] {
  const items = rows
    .map((row) => {
      if (row.cellsHtml.length < 4) {
        return null;
      }

      const isCompanyStyleRow = row.cellsHtml.length >= 6;
      const dateText = normalizeText(row.cellsHtml[0] ?? "");
      const timeText = normalizeText(row.cellsHtml[1] ?? "");
      const symbolCell = isCompanyStyleRow ? row.cellsHtml[2] ?? "" : "";
      const companyCell = isCompanyStyleRow ? row.cellsHtml[3] ?? "" : "";
      const titleCell = isCompanyStyleRow
        ? row.cellsHtml[4] ?? ""
        : row.cellsHtml[2] ?? "";
      const linksCell = isCompanyStyleRow
        ? row.cellsHtml[5] ?? ""
        : row.cellsHtml[3] ?? "";

      const title = normalizeText(titleCell);
      if (title.length === 0) {
        return null;
      }

      const symbol =
        extractSymbolFromCell(symbolCell) ?? extractSymbolFromTitle(title);
      const companyName = normalizeText(companyCell);
      const pdfUrl = extractPdfUrlFromCell(linksCell);
      const occurredAt = parseDateToIso(dateText, timeText);

      const summaryParts: string[] = [];
      if (companyName.length > 0) {
        summaryParts.push(companyName);
      }
      if (symbol) {
        summaryParts.push(symbol);
      }

      return buildAnnouncementItem({
        sourceKey,
        sourceLabel,
        title,
        summary: summaryParts.join(" • "),
        symbol,
        companyName: companyName.length > 0 ? companyName : null,
        dateLabel: dateText,
        timeLabel: timeText.length > 0 ? timeText : null,
        occurredAt,
        pdfUrl,
      });
    })
    .filter((item): item is PsxAnnouncementItem => item !== null);

  return sortAnnouncementItems(items);
}

function parsePayoutRowsToItems(rows: ParsedTableRow[]): PsxAnnouncementItem[] {
  const sourceKey: PsxAnnouncementSourceKey = "payouts";
  const sourceLabel = getSourceLabel(sourceKey);

  const items = rows
    .map((row) => {
      if (row.cellsHtml.length < 6) {
        return null;
      }

      const symbol = extractSymbolFromCell(row.cellsHtml[0] ?? "");
      const companyName = normalizeText(row.cellsHtml[1] ?? "");
      const sectorName = normalizeText(row.cellsHtml[2] ?? "");
      const payoutText = normalizeText(row.cellsHtml[3] ?? "");
      const announcedAtText = normalizeText(row.cellsHtml[4] ?? "");
      const bookClosureText = normalizeText(row.cellsHtml[5] ?? "");

      if (companyName.length === 0 && payoutText.length === 0) {
        return null;
      }

      const titleSymbol = symbol ? `${symbol} ` : "";
      const title = `${titleSymbol}Payout Update`.trim();
      const summary = [companyName, sectorName, payoutText, bookClosureText]
        .filter((part) => part.length > 0)
        .join(" • ");
      const occurredAt = parseDateToIso(announcedAtText);

      return buildAnnouncementItem({
        sourceKey,
        sourceLabel,
        title,
        summary,
        symbol,
        companyName: companyName.length > 0 ? companyName : null,
        dateLabel: announcedAtText,
        timeLabel: null,
        occurredAt,
        pdfUrl: null,
      });
    })
    .filter((item): item is PsxAnnouncementItem => item !== null);

  return sortAnnouncementItems(items);
}

function parseCalendarEventsToItems(events: CalendarEvent[]): PsxAnnouncementItem[] {
  const sourceKey: PsxAnnouncementSourceKey = "agmEogmCalendar";
  const sourceLabel = getSourceLabel(sourceKey);

  const items = events
    .map((eventItem) => {
      const symbol = normalizeSymbol(eventItem.symbol);
      const companyName = normalizeText(eventItem.name ?? "");
      const eventType = normalizeText(eventItem.type ?? "");
      const cityName = normalizeText(eventItem.city ?? "");
      const periodEnd = normalizeText(eventItem.period_end ?? "");
      const dateLabel = normalizeText(eventItem.date ?? "");
      const timeLabel = normalizeText(eventItem.time ?? "");

      const titleParts = [eventType, companyName].filter(
        (part) => part.length > 0,
      );
      const title =
        titleParts.length > 0 ? titleParts.join(" • ") : "Calendar Event";
      const summaryParts = [symbol ?? "", cityName, periodEnd].filter(
        (part) => part.length > 0,
      );
      const occurredAt = parseDateToIso(dateLabel, timeLabel);

      return buildAnnouncementItem({
        sourceKey,
        sourceLabel,
        title,
        summary: summaryParts.join(" • "),
        symbol,
        companyName: companyName.length > 0 ? companyName : null,
        dateLabel,
        timeLabel: timeLabel.length > 0 ? timeLabel : null,
        occurredAt,
        pdfUrl: null,
      });
    })
    .filter((item) => item.title.length > 0);

  return sortAnnouncementItems(items);
}

function parseGisRowsToItems(rows: ParsedTableRow[]): PsxAnnouncementItem[] {
  const sourceKey: PsxAnnouncementSourceKey = "gisAuctionResults";
  const sourceLabel = getSourceLabel(sourceKey);

  const items = rows
    .map((row) => {
      if (row.cellsHtml.length < 6) {
        return null;
      }

      const symbol = extractSymbolFromCell(row.cellsHtml[0] ?? "");
      const securityType = normalizeText(row.cellsHtml[1] ?? "");
      const auctionDate = normalizeText(row.cellsHtml[2] ?? "");
      const issueDate = normalizeText(row.cellsHtml[3] ?? "");
      const maturityDate = normalizeText(row.cellsHtml[4] ?? "");
      const fileCellHtml = row.cellsHtml[row.cellsHtml.length - 1] ?? "";
      const pdfUrl = extractPdfUrlFromCell(fileCellHtml);

      if (!symbol && securityType.length === 0) {
        return null;
      }

      const title = `${symbol ?? "GIS"} Auction Result`;
      const summary = [securityType, issueDate, maturityDate]
        .filter((part) => part.length > 0)
        .join(" • ");
      const occurredAt = parseDateToIso(auctionDate);

      return buildAnnouncementItem({
        sourceKey,
        sourceLabel,
        title,
        summary,
        symbol,
        companyName: null,
        dateLabel: auctionDate,
        timeLabel: null,
        occurredAt,
        pdfUrl,
      });
    })
    .filter((item): item is PsxAnnouncementItem => item !== null);

  return sortAnnouncementItems(items);
}

async function postFormRequest(
  path: string,
  payload: Record<string, string>,
): Promise<string> {
  const response = await fetch(toAbsolutePsxUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams(payload).toString(),
  });

  if (!response.ok) {
    throw new Error(`PSX request failed: ${response.status}`);
  }

  return response.text();
}

function formatCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const today = new Date();
  const fromDate = new Date(today);
  const toDate = new Date(today);
  fromDate.setMonth(fromDate.getMonth() - 1);
  toDate.setMonth(toDate.getMonth() + 2);

  const response = await fetch(toAbsolutePsxUrl("/calendar"), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams({
      from: formatCalendarDate(fromDate),
      to: formatCalendarDate(toDate),
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`PSX calendar request failed: ${response.status}`);
  }

  const parsed = (await response.json()) as CalendarResponse;
  if (!parsed || parsed.status !== 1 || !Array.isArray(parsed.data)) {
    return [];
  }

  return parsed.data;
}

async function fetchSourceItems(
  sourceKey: PsxAnnouncementSourceKey,
  count: number,
): Promise<PsxAnnouncementItem[]> {
  if (
    sourceKey === "psxNotices" ||
    sourceKey === "companyAnnouncements" ||
    sourceKey === "cdcNotices" ||
    sourceKey === "secpNotices" ||
    sourceKey === "nccplNotices"
  ) {
    const type = ANNOUNCEMENT_TYPE_BY_SOURCE[sourceKey];
    if (!type) {
      return [];
    }

    const sourceLabel = getSourceLabel(sourceKey);
    const html = await postFormRequest("/announcements", {
      type,
      symbol: "",
      query: "",
      count: String(count),
      offset: "0",
      date_from: "",
      date_to: "",
      page: "annc",
    });
    const rows = parseTableRowsFromHtml(html, sourceKey);
    return parseAnnouncementRowsToItems(sourceKey, sourceLabel, rows);
  }

  if (sourceKey === "corporateBriefingSessions") {
    const sourceLabel = getSourceLabel(sourceKey);
    const html = await postFormRequest("/announcements", {
      type: "C",
      symbol: "",
      query: "",
      count: String(count),
      offset: "0",
      date_from: "",
      date_to: "",
      page: "cbs",
    });
    const rows = parseTableRowsFromHtml(html, sourceKey);
    return parseAnnouncementRowsToItems(sourceKey, sourceLabel, rows);
  }

  if (sourceKey === "payouts") {
    const html = await postFormRequest("/payouts", {
      symbol: "",
      count: String(count),
      offset: "0",
    });
    const rows = parseTableRowsFromHtml(html, sourceKey);
    return parsePayoutRowsToItems(rows);
  }

  if (sourceKey === "agmEogmCalendar") {
    const events = await fetchCalendarEvents();
    return parseCalendarEventsToItems(events).slice(0, count);
  }

  if (sourceKey === "gisAuctionResults") {
    const response = await fetch(toAbsolutePsxUrl("/gis-auction-results"));
    if (!response.ok) {
      throw new Error(`PSX GIS request failed: ${response.status}`);
    }

    const html = await response.text();
    const rows = parseTableRowsFromHtml(html, sourceKey);
    return parseGisRowsToItems(rows).slice(0, count);
  }

  return [];
}

function getFallbackSnapshot(
  sourceKey: PsxAnnouncementSourceKey,
  source: PsxAnnouncementSourceType = "fallback",
): PsxAnnouncementSnapshot {
  return {
    sourceKey,
    sourceLabel: getSourceLabel(sourceKey),
    asOf: null,
    items: [],
    source,
  };
}

async function readAnnouncementsCacheStore(): Promise<AnnouncementCacheStore | null> {
  if (!ANNOUNCEMENTS_CACHE_FILE_URI) {
    return null;
  }

  try {
    const storedRaw = await FileSystem.readAsStringAsync(ANNOUNCEMENTS_CACHE_FILE_URI);
    const parsed = JSON.parse(storedRaw) as Partial<AnnouncementCacheStore>;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.bySource ||
      typeof parsed.bySource !== "object"
    ) {
      return null;
    }

    const bySource: Partial<Record<PsxAnnouncementSourceKey, AnnouncementCacheEntry>> = {};

    for (const [rawKey, rawValue] of Object.entries(parsed.bySource)) {
      if (!isPsxAnnouncementSourceKey(rawKey)) {
        continue;
      }

      if (
        !rawValue ||
        typeof rawValue !== "object" ||
        !Array.isArray((rawValue as AnnouncementCacheEntry).items) ||
        typeof (rawValue as AnnouncementCacheEntry).asOf !== "string"
      ) {
        continue;
      }

      bySource[rawKey] = {
        asOf: (rawValue as AnnouncementCacheEntry).asOf,
        items: (rawValue as AnnouncementCacheEntry).items,
      };
    }

    return {
      version: 1,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
      bySource,
    };
  } catch {
    return null;
  }
}

async function writeAnnouncementsCacheStore(
  store: AnnouncementCacheStore,
): Promise<void> {
  if (!ANNOUNCEMENTS_CACHE_FILE_URI) {
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(
      ANNOUNCEMENTS_CACHE_FILE_URI,
      JSON.stringify(store),
    );
  } catch {
    // Ignore cache write failures to keep app responsive.
  }
}

async function updateAnnouncementsCache(
  sourceKey: PsxAnnouncementSourceKey,
  entry: AnnouncementCacheEntry,
): Promise<void> {
  const existingStore = await readAnnouncementsCacheStore();
  const nextStore: AnnouncementCacheStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    bySource: {
      ...(existingStore?.bySource ?? {}),
      [sourceKey]: entry,
    },
  };

  await writeAnnouncementsCacheStore(nextStore);
}

export function getPsxAnnouncementSources(): PsxAnnouncementSourceDefinition[] {
  return ANNOUNCEMENT_SOURCE_DEFINITIONS;
}

export function getPsxAnnouncementSourceDefinition(
  sourceKey: PsxAnnouncementSourceKey,
): PsxAnnouncementSourceDefinition {
  const matchedSource = ANNOUNCEMENT_SOURCE_DEFINITIONS.find(
    (sourceDefinition) => sourceDefinition.key === sourceKey,
  );

  return (
    matchedSource ?? {
      key: sourceKey,
      label: "PSX Announcements",
    }
  );
}

export function normalizePsxAnnouncementSourceKey(
  rawValue: string | null | undefined,
): PsxAnnouncementSourceKey {
  if (rawValue && isPsxAnnouncementSourceKey(rawValue)) {
    return rawValue;
  }

  return "psxNotices";
}

export async function getCachedPsxAnnouncements(
  sourceKey: PsxAnnouncementSourceKey,
): Promise<PsxAnnouncementSnapshot | null> {
  const storedCache = await readAnnouncementsCacheStore();
  if (!storedCache) {
    return null;
  }

  const sourceEntry = storedCache.bySource[sourceKey];
  if (!sourceEntry) {
    return null;
  }

  return {
    sourceKey,
    sourceLabel: getSourceLabel(sourceKey),
    asOf: sourceEntry.asOf,
    items: sourceEntry.items,
    source: "cache",
  };
}

export async function getLatestPsxAnnouncements(
  sourceKey: PsxAnnouncementSourceKey,
  options?: { count?: number },
): Promise<PsxAnnouncementSnapshot> {
  const nowTimestamp = Date.now();
  const count = Math.max(1, Math.min(options?.count ?? DEFAULT_FETCH_COUNT, 100));

  try {
    const liveItems = await fetchSourceItems(sourceKey, count);
    latestAnnouncementFetchTimestamp = nowTimestamp;
    const asOf = new Date().toISOString();

    await updateAnnouncementsCache(sourceKey, {
      asOf,
      items: liveItems,
    });

    return {
      sourceKey,
      sourceLabel: getSourceLabel(sourceKey),
      asOf,
      items: liveItems,
      source: "live",
    };
  } catch {
    const cachedSnapshot = await getCachedPsxAnnouncements(sourceKey);
    if (cachedSnapshot) {
      return cachedSnapshot;
    }

    return getFallbackSnapshot(sourceKey);
  }
}

export function getLatestAnnouncementFetchTimestamp(): number {
  return latestAnnouncementFetchTimestamp;
}

export function shouldRefreshAnnouncements(
  nowTimestamp: number,
  staleThresholdMs: number = ANNOUNCEMENT_REFRESH_INTERVAL_MS,
): boolean {
  return nowTimestamp - latestAnnouncementFetchTimestamp >= staleThresholdMs;
}
