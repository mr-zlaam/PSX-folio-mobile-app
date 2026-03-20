import * as FileSystem from "expo-file-system/legacy";

const PSX_COMPANY_BASE_URL = "https://dps.psx.com.pk/company";
const COMPANY_SECTION_IDS = [
  "quote",
  "profile",
  "equity",
  "announcements",
  "financials",
  "ratios",
  "payouts",
  "reports",
] as const;

const FINANCIAL_PANEL_NAMES = ["Annual", "Quarterly"] as const;
const ANNOUNCEMENT_PANEL_NAMES = [
  "Financial Results",
  "Board Meetings",
  "Others",
] as const;

type CompanySectionId = (typeof COMPANY_SECTION_IDS)[number];
type CompanyPanelName = (typeof FINANCIAL_PANEL_NAMES)[number];

export type CompanyDetailMetric = {
  label: string;
  value: string;
};

export type CompanyDetailPerson = {
  name: string;
  role: string;
};

export type CompanyDetailAnnouncement = {
  category: string;
  date: string;
  title: string;
  document: string;
  pdfUrl: string | null;
};

export type CompanyDetailMatrixRow = {
  label: string;
  values: string[];
};

export type CompanyDetailMatrixTable = {
  title: string;
  rowLabel: string;
  columns: string[];
  rows: CompanyDetailMatrixRow[];
};

export type CompanyDetailSnapshot = {
  symbol: string;
  companyName: string;
  sector: string;
  businessDescription: string | null;
  profileMetrics: CompanyDetailMetric[];
  keyPeople: CompanyDetailPerson[];
  equityMetrics: CompanyDetailMetric[];
  announcements: CompanyDetailAnnouncement[];
  annualFinancials: CompanyDetailMatrixTable | null;
  quarterlyFinancials: CompanyDetailMatrixTable | null;
  ratioTable: CompanyDetailMatrixTable | null;
  payoutMetrics: CompanyDetailMetric[];
  reportItems: CompanyDetailMetric[];
  updatedAt: string;
  source: "live" | "cache" | "fallback";
};

type CompanyDetailCacheSnapshot = {
  version: 1;
  updatedAt: string;
  detail: CompanyDetailSnapshot;
};

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function getCompanyDetailCacheFileUri(symbol: string): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  const normalizedSymbol = normalizeSymbol(symbol);
  if (normalizedSymbol.length === 0) {
    return null;
  }

  return `${FileSystem.documentDirectory}psx-company-${normalizedSymbol}.json`;
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

function dedupeMetrics(metrics: CompanyDetailMetric[]): CompanyDetailMetric[] {
  const seen = new Set<string>();
  return metrics.filter((metric) => {
    const normalizedLabel = metric.label.toLowerCase();
    if (seen.has(normalizedLabel)) {
      return false;
    }

    seen.add(normalizedLabel);
    return true;
  });
}

function indexOfSectionId(
  html: string,
  id: CompanySectionId,
  fromIndex = 0
): number {
  const doubleQuoteMatch = html.indexOf(`id="${id}"`, fromIndex);
  const singleQuoteMatch = html.indexOf(`id='${id}'`, fromIndex);

  if (doubleQuoteMatch === -1) {
    return singleQuoteMatch;
  }

  if (singleQuoteMatch === -1) {
    return doubleQuoteMatch;
  }

  return Math.min(doubleQuoteMatch, singleQuoteMatch);
}

function extractSectionById(html: string, id: CompanySectionId): string {
  const sectionStartIndex = indexOfSectionId(html, id);
  if (sectionStartIndex < 0) {
    return "";
  }

  const nextSectionIndices = COMPANY_SECTION_IDS.map((sectionId) =>
    indexOfSectionId(html, sectionId, sectionStartIndex + 1)
  ).filter((sectionIndex) => sectionIndex > sectionStartIndex);

  const sectionEndIndex =
    nextSectionIndices.length > 0 ? Math.min(...nextSectionIndices) : html.length;

  return html.slice(sectionStartIndex, sectionEndIndex);
}

function extractFirstTable(sectionHtml: string): string | null {
  const tableMatch = sectionHtml.match(/<table\b[\s\S]*?<\/table>/i);
  return tableMatch ? tableMatch[0] : null;
}

function parseTableBodyRows(tableHtml: string): string[][] {
  const tableBodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const sourceHtml = tableBodyMatch?.[1] ?? tableHtml;
  const rowMatches = sourceHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  return rowMatches
    .map((rowHtml) => {
      const cellMatches = rowHtml.match(/<td\b[\s\S]*?<\/td>/gi) ?? [];
      return cellMatches
        .map((cellHtml) => normalizeText(cellHtml))
        .filter((cellText) => cellText.length > 0);
    })
    .filter((cells) => cells.length > 0);
}

function parseMatrixTable(
  tableHtml: string,
  tableTitle: string
): CompanyDetailMatrixTable | null {
  const headMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const headerCells = headMatch
    ? Array.from(headMatch[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi))
        .map((match) => normalizeText(match[1] ?? ""))
        .filter((headerText) => headerText.length > 0)
    : [];

  const bodyRows = parseTableBodyRows(tableHtml);
  if (bodyRows.length === 0) {
    return null;
  }

  let columns = headerCells.slice(1);
  const maximumValueCount = bodyRows.reduce(
    (currentMaximum, rowCells) =>
      Math.max(currentMaximum, Math.max(0, rowCells.length - 1)),
    0
  );
  if (columns.length === 0 && maximumValueCount > 0) {
    columns = Array.from({ length: maximumValueCount }, (_, index) => {
      return `Value ${index + 1}`;
    });
  }

  const rowLabel = headerCells[0] && headerCells[0].length > 0 ? headerCells[0] : "Item";
  const rows = bodyRows
    .map((rowCells) => {
      const label = rowCells[0] ?? "--";
      const values = columns.map((_, columnIndex) => rowCells[columnIndex + 1] ?? "--");
      return {
        label,
        values,
      };
    })
    .filter((rowItem) => rowItem.label.trim().length > 0);

  if (rows.length === 0 || columns.length === 0) {
    return null;
  }

  return {
    title: tableTitle,
    rowLabel,
    columns,
    rows,
  };
}

function parseCompanyName(quoteSection: string): string | null {
  const quoteNameMatch = quoteSection.match(
    /class="quote__name">([\s\S]*?)<div class="quote__sector">/i
  );
  if (!quoteNameMatch || !quoteNameMatch[1]) {
    return null;
  }

  const parsedName = normalizeText(quoteNameMatch[1]);
  return parsedName.length > 0 ? parsedName : null;
}

function parseCompanySector(quoteSection: string): string | null {
  const sectorMatch = quoteSection.match(
    /class="quote__sector">\s*<span>([\s\S]*?)<\/span>/i
  );
  if (!sectorMatch || !sectorMatch[1]) {
    return null;
  }

  const parsedSector = normalizeText(sectorMatch[1]);
  return parsedSector.length > 0 ? parsedSector : null;
}

function parseBusinessDescription(profileSection: string): string | null {
  const descriptionMatch = profileSection.match(
    /<div class="item__head">\s*BUSINESS DESCRIPTION\s*<\/div>\s*<p>([\s\S]*?)<\/p>/i
  );
  if (!descriptionMatch || !descriptionMatch[1]) {
    return null;
  }

  const description = normalizeText(descriptionMatch[1]);
  return description.length > 0 ? description : null;
}

function parseProfileMetrics(profileSection: string): CompanyDetailMetric[] {
  const headMatches = Array.from(
    profileSection.matchAll(/<div class="item__head">([\s\S]*?)<\/div>/gi)
  );
  const metrics: CompanyDetailMetric[] = [];

  headMatches.forEach((headMatch, headIndex) => {
    const label = normalizeText(headMatch[1] ?? "");
    if (label.length === 0) {
      return;
    }

    const currentIndex = headMatch.index ?? -1;
    if (currentIndex < 0) {
      return;
    }

    const nextHeadIndex =
      headMatches[headIndex + 1]?.index ?? profileSection.length;
    const sliceAfterHead = profileSection.slice(
      currentIndex + headMatch[0].length,
      nextHeadIndex
    );
    const valueMatch = sliceAfterHead.match(/<p>([\s\S]*?)<\/p>/i);
    if (!valueMatch || !valueMatch[1]) {
      return;
    }

    const value = normalizeText(valueMatch[1]);
    if (value.length === 0) {
      return;
    }

    const normalizedLabel = label.toLowerCase();
    if (
      normalizedLabel === "business description" ||
      normalizedLabel === "key people"
    ) {
      return;
    }

    metrics.push({
      label,
      value,
    });
  });

  return dedupeMetrics(metrics);
}

function parseKeyPeople(profileSection: string): CompanyDetailPerson[] {
  const keyPeopleTableMatch = profileSection.match(
    /<div class="item__head">\s*KEY PEOPLE\s*<\/div>\s*<table[^>]*>([\s\S]*?)<\/table>/i
  );
  if (!keyPeopleTableMatch || !keyPeopleTableMatch[0]) {
    return [];
  }

  return parseTableBodyRows(keyPeopleTableMatch[0])
    .map((rowCells) => ({
      name: rowCells[0] ?? "",
      role: rowCells[1] ?? "",
    }))
    .filter((person) => person.name.length > 0);
}

function parseStatsMetrics(sectionHtml: string): CompanyDetailMetric[] {
  const metricMatches = Array.from(
    sectionHtml.matchAll(
      /<div class="stats_label">([\s\S]*?)<\/div>\s*<div class="stats_value">([\s\S]*?)<\/div>/gi
    )
  );

  const metrics = metricMatches
    .map((metricMatch) => ({
      label: normalizeText(metricMatch[1] ?? ""),
      value: normalizeText(metricMatch[2] ?? ""),
    }))
    .filter((metricItem) => metricItem.label.length > 0 && metricItem.value.length > 0);

  return dedupeMetrics(metrics);
}

function findPanelNameIndex(
  sectionHtml: string,
  panelName: string,
  fromIndex = 0
): number {
  const dataNameToken = `data-name="${panelName}"`;
  let currentIndex = sectionHtml.indexOf(dataNameToken, fromIndex);

  while (currentIndex >= 0) {
    const contextStart = Math.max(0, currentIndex - 100);
    const context = sectionHtml.slice(contextStart, currentIndex);
    if (context.includes("tabs__panel")) {
      return currentIndex;
    }

    currentIndex = sectionHtml.indexOf(dataNameToken, currentIndex + dataNameToken.length);
  }

  return -1;
}

function extractPanelHtml(
  sectionHtml: string,
  panelName: string,
  panelNames: readonly string[]
): string {
  const panelStartIndex = findPanelNameIndex(sectionHtml, panelName);
  if (panelStartIndex < 0) {
    return "";
  }

  const nextPanelIndices = panelNames
    .map((candidatePanelName) =>
      findPanelNameIndex(sectionHtml, candidatePanelName, panelStartIndex + 1)
    )
    .filter((panelIndex) => panelIndex > panelStartIndex);

  const panelEndIndex =
    nextPanelIndices.length > 0 ? Math.min(...nextPanelIndices) : sectionHtml.length;

  return sectionHtml.slice(panelStartIndex, panelEndIndex);
}

function parseFinancialPanel(
  financialsSection: string,
  panelName: CompanyPanelName
): CompanyDetailMatrixTable | null {
  const panelHtml = extractPanelHtml(
    financialsSection,
    panelName,
    FINANCIAL_PANEL_NAMES
  );
  if (panelHtml.length === 0) {
    return null;
  }

  const tableHtml = extractFirstTable(panelHtml);
  if (!tableHtml) {
    return null;
  }

  return parseMatrixTable(tableHtml, panelName);
}

function resolvePsxUrl(rawUrl: string): string | null {
  const trimmedUrl = rawUrl.trim();
  if (trimmedUrl.length === 0 || trimmedUrl.toLowerCase().startsWith("javascript")) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("//")) {
    return `https:${trimmedUrl}`;
  }

  if (trimmedUrl.startsWith("/")) {
    return `https://dps.psx.com.pk${trimmedUrl}`;
  }

  return `https://dps.psx.com.pk/${trimmedUrl.replace(/^\.?\//, "")}`;
}

function parseReportItems(reportsSection: string): CompanyDetailMetric[] {
  const wrapperMatch = reportsSection.match(
    /<div class="tbl__wrapper">([\s\S]*?)<\/div>/i
  );
  const sourceHtml = wrapperMatch?.[1] ?? reportsSection;
  const linkMatches = Array.from(
    sourceHtml.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
  );

  return linkMatches
    .map((linkMatch, index) => {
      const rawHref = (linkMatch[1] ?? "").trim();
      const rawText = normalizeText(linkMatch[2] ?? "");
      const label = rawText.length > 0 ? rawText : `Report ${index + 1}`;
      const value = rawHref.length > 0 ? rawHref : "--";

      return {
        label,
        value,
      };
    })
    .filter((metricItem) => metricItem.value !== "--");
}

function getFallbackCompanyDetail(symbol: string): CompanyDetailSnapshot {
  const normalizedSymbol = normalizeSymbol(symbol);
  return {
    symbol: normalizedSymbol,
    companyName: normalizedSymbol,
    sector: "UNKNOWN",
    businessDescription: null,
    profileMetrics: [],
    keyPeople: [],
    equityMetrics: [],
    announcements: [],
    annualFinancials: null,
    quarterlyFinancials: null,
    ratioTable: null,
    payoutMetrics: [],
    reportItems: [],
    updatedAt: new Date().toISOString(),
    source: "fallback",
  };
}

function parseCompanyDetailHtml(
  symbol: string,
  html: string,
  source: "live" | "cache"
): CompanyDetailSnapshot {
  const fallback = getFallbackCompanyDetail(symbol);
  const quoteSection = extractSectionById(html, "quote");
  const profileSection = extractSectionById(html, "profile");
  const equitySection = extractSectionById(html, "equity");
  const announcementsSection = extractSectionById(html, "announcements");
  const financialsSection = extractSectionById(html, "financials");
  const ratiosSection = extractSectionById(html, "ratios");
  const payoutsSection = extractSectionById(html, "payouts");
  const reportsSection = extractSectionById(html, "reports");

  const ratioTableSource = extractFirstTable(ratiosSection);
  const ratioTable = ratioTableSource ? parseMatrixTable(ratioTableSource, "Ratios") : null;

  return {
    symbol: fallback.symbol,
    companyName: parseCompanyName(quoteSection) ?? fallback.companyName,
    sector: parseCompanySector(quoteSection) ?? fallback.sector,
    businessDescription: parseBusinessDescription(profileSection),
    profileMetrics: parseProfileMetrics(profileSection),
    keyPeople: parseKeyPeople(profileSection),
    equityMetrics: parseStatsMetrics(equitySection),
    announcements: parseAnnouncements(announcementsSection),
    annualFinancials: parseFinancialPanel(financialsSection, "Annual"),
    quarterlyFinancials: parseFinancialPanel(financialsSection, "Quarterly"),
    ratioTable,
    payoutMetrics: parseStatsMetrics(payoutsSection),
    reportItems: parseReportItems(reportsSection),
    updatedAt: new Date().toISOString(),
    source,
  };
}

function parseAnnouncements(
  announcementsSection: string
): CompanyDetailAnnouncement[] {
  const announcementItems: CompanyDetailAnnouncement[] = [];

  for (const panelName of ANNOUNCEMENT_PANEL_NAMES) {
    const panelHtml = extractPanelHtml(
      announcementsSection,
      panelName,
      ANNOUNCEMENT_PANEL_NAMES
    );
    if (panelHtml.length === 0) {
      continue;
    }

    const tableHtml = extractFirstTable(panelHtml);
    if (!tableHtml) {
      continue;
    }

    const tableBodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    const sourceHtml = tableBodyMatch?.[1] ?? tableHtml;
    const rowMatches = sourceHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

    rowMatches.forEach((rowHtml) => {
      const cellMatches = rowHtml.match(/<td\b[\s\S]*?<\/td>/gi) ?? [];
      if (cellMatches.length < 2) {
        return;
      }

      const dateText = normalizeText(cellMatches[0] ?? "");
      const titleText = normalizeText(cellMatches[1] ?? "");
      const documentCellHtml = cellMatches[2] ?? "";
      const documentText = normalizeText(documentCellHtml);

      const pdfHrefMatch =
        documentCellHtml.match(
          /<a\b[^>]*href="([^"]+\.pdf(?:\?[^"]*)?)"[^>]*>/i
        ) ??
        documentCellHtml.match(
          /<a\b[^>]*href="([^"]+)"[^>]*>\s*PDF\s*<\/a>/i
        );
      const pdfUrl = pdfHrefMatch?.[1] ? resolvePsxUrl(pdfHrefMatch[1]) : null;

      if (dateText.length === 0 && titleText.length === 0) {
        return;
      }

      announcementItems.push({
        category: panelName,
        date: dateText.length > 0 ? dateText : "--",
        title: titleText.length > 0 ? titleText : "--",
        document: documentText.length > 0 ? documentText : "--",
        pdfUrl,
      });
    });
  }

  return announcementItems;
}

async function writeCompanyDetailToCache(
  symbol: string,
  detail: CompanyDetailSnapshot
): Promise<void> {
  const cacheFileUri = getCompanyDetailCacheFileUri(symbol);
  if (!cacheFileUri) {
    return;
  }

  const cacheSnapshot: CompanyDetailCacheSnapshot = {
    version: 1,
    updatedAt: new Date().toISOString(),
    detail,
  };

  try {
    await FileSystem.writeAsStringAsync(cacheFileUri, JSON.stringify(cacheSnapshot));
  } catch {
    // Ignore cache write failures to keep UI responsive.
  }
}

async function readCompanyDetailFromCache(
  symbol: string
): Promise<CompanyDetailSnapshot | null> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const cacheFileUri = getCompanyDetailCacheFileUri(normalizedSymbol);
  if (!cacheFileUri) {
    return null;
  }

  try {
    const rawSnapshot = await FileSystem.readAsStringAsync(cacheFileUri);
    const parsedSnapshot = JSON.parse(rawSnapshot) as Partial<CompanyDetailCacheSnapshot>;
    if (!parsedSnapshot.detail || typeof parsedSnapshot.detail !== "object") {
      return null;
    }

    const detail = parsedSnapshot.detail as CompanyDetailSnapshot;
    if (
      typeof detail.symbol !== "string" ||
      normalizeSymbol(detail.symbol) !== normalizedSymbol
    ) {
      return null;
    }

    return {
      ...detail,
      source: "cache",
    };
  } catch {
    return null;
  }
}

async function fetchCompanyDetailHtml(symbol: string): Promise<string> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const response = await fetch(
    `${PSX_COMPANY_BASE_URL}/${encodeURIComponent(normalizedSymbol)}`,
    {
      headers: {
        Accept: "text/html",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Company detail request failed (${response.status})`);
  }

  const html = await response.text();
  if (html.trim().length === 0) {
    throw new Error("Company detail response is empty");
  }

  return html;
}

export async function getCachedCompanyDetail(
  symbol: string
): Promise<CompanyDetailSnapshot | null> {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (normalizedSymbol.length === 0) {
    return null;
  }

  return readCompanyDetailFromCache(normalizedSymbol);
}

export async function getLatestCompanyDetail(
  symbol: string
): Promise<CompanyDetailSnapshot | null> {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (normalizedSymbol.length === 0) {
    return null;
  }

  try {
    const html = await fetchCompanyDetailHtml(normalizedSymbol);
    const parsedDetail = parseCompanyDetailHtml(normalizedSymbol, html, "live");
    await writeCompanyDetailToCache(normalizedSymbol, parsedDetail);
    return parsedDetail;
  } catch {
    return getCachedCompanyDetail(normalizedSymbol);
  }
}
