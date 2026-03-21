import * as FileSystem from "expo-file-system/legacy";

type DpsMarketStatusSource = "live" | "cache" | "fallback";

export type DpsMarketUiStatus = "OPEN" | "CLOSED" | "HALTED";

export type DpsMarketBoardStatus = {
  key: string;
  title: string;
  stateText: string;
  uiStatus: DpsMarketUiStatus;
};

export type DpsMarketStatusSnapshot = {
  primaryBoardKey: string | null;
  primaryBoardTitle: string | null;
  stateText: string;
  uiStatus: DpsMarketUiStatus;
  boards: DpsMarketBoardStatus[];
  fetchedAt: string | null;
  source: DpsMarketStatusSource;
};

type DpsMarketStatusStore = {
  version: 1;
  updatedAt: string;
  snapshot: DpsMarketStatusSnapshot | null;
};

const DPS_HOME_URL = "https://dps.psx.com.pk/";
const DPS_MARKET_STATUS_CACHE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-dps-market-status-cache.json`
  : null;

const PRIMARY_BOARD_PRIORITY = ["REG", "GEM-REG", "DFC", "CSF", "ODL", "SQR"];

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

function normalizeStateText(value: string): string {
  return normalizeText(value).toUpperCase();
}

function mapStateToUiStatus(stateText: string): DpsMarketUiStatus {
  const normalizedState = normalizeStateText(stateText);
  if (normalizedState.includes("OPEN")) {
    return "OPEN";
  }
  if (
    normalizedState.includes("HALT") ||
    normalizedState.includes("SUSPEND") ||
    normalizedState.includes("PAUSE")
  ) {
    return "HALTED";
  }
  if (normalizedState.includes("CLOSE")) {
    return "CLOSED";
  }
  return "CLOSED";
}

function getFallbackDpsMarketStatus(source: DpsMarketStatusSource): DpsMarketStatusSnapshot {
  return {
    primaryBoardKey: null,
    primaryBoardTitle: null,
    stateText: "CLOSED",
    uiStatus: "CLOSED",
    boards: [],
    fetchedAt: null,
    source,
  };
}

function toSafeSnapshot(
  snapshot: DpsMarketStatusSnapshot | null | undefined,
  sourceFallback: DpsMarketStatusSource
): DpsMarketStatusSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    return getFallbackDpsMarketStatus(sourceFallback);
  }

  const boards = Array.isArray(snapshot.boards)
    ? snapshot.boards
        .filter(
          (board): board is DpsMarketBoardStatus =>
            Boolean(board) &&
            typeof board.key === "string" &&
            typeof board.title === "string" &&
            typeof board.stateText === "string" &&
            (board.uiStatus === "OPEN" ||
              board.uiStatus === "CLOSED" ||
              board.uiStatus === "HALTED")
        )
        .map((board) => ({
          ...board,
          key: board.key.trim().toUpperCase(),
          title: normalizeText(board.title),
          stateText: normalizeStateText(board.stateText),
        }))
    : [];

  const uiStatus: DpsMarketUiStatus =
    snapshot.uiStatus === "OPEN" ||
    snapshot.uiStatus === "HALTED" ||
    snapshot.uiStatus === "CLOSED"
      ? snapshot.uiStatus
      : "CLOSED";

  const stateText = normalizeStateText(snapshot.stateText ?? "");

  return {
    primaryBoardKey:
      typeof snapshot.primaryBoardKey === "string" &&
      snapshot.primaryBoardKey.trim().length > 0
        ? snapshot.primaryBoardKey.trim().toUpperCase()
        : null,
    primaryBoardTitle:
      typeof snapshot.primaryBoardTitle === "string" &&
      snapshot.primaryBoardTitle.trim().length > 0
        ? normalizeText(snapshot.primaryBoardTitle)
        : null,
    stateText: stateText.length > 0 ? stateText : uiStatus,
    uiStatus,
    boards,
    fetchedAt:
      typeof snapshot.fetchedAt === "string" && snapshot.fetchedAt.trim().length > 0
        ? snapshot.fetchedAt
        : null,
    source:
      snapshot.source === "live" ||
      snapshot.source === "cache" ||
      snapshot.source === "fallback"
        ? snapshot.source
        : sourceFallback,
  };
}

function getSafeStore(rawValue: unknown): DpsMarketStatusStore {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      snapshot: null,
    };
  }

  const parsedStore = rawValue as Partial<DpsMarketStatusStore>;
  return {
    version: 1,
    updatedAt:
      typeof parsedStore.updatedAt === "string"
        ? parsedStore.updatedAt
        : new Date().toISOString(),
    snapshot: toSafeSnapshot(parsedStore.snapshot ?? null, "fallback"),
  };
}

async function readStore(): Promise<DpsMarketStatusStore> {
  if (!DPS_MARKET_STATUS_CACHE_FILE_URI) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      snapshot: null,
    };
  }

  try {
    const rawStore = await FileSystem.readAsStringAsync(
      DPS_MARKET_STATUS_CACHE_FILE_URI
    );
    return getSafeStore(JSON.parse(rawStore));
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      snapshot: null,
    };
  }
}

async function writeStore(snapshot: DpsMarketStatusSnapshot): Promise<void> {
  if (!DPS_MARKET_STATUS_CACHE_FILE_URI) {
    return;
  }

  const nextStore: DpsMarketStatusStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    snapshot,
  };

  await FileSystem.writeAsStringAsync(
    DPS_MARKET_STATUS_CACHE_FILE_URI,
    JSON.stringify(nextStore)
  );
}

function parseBoardsFromHtml(html: string): DpsMarketBoardStatus[] {
  const boards: DpsMarketBoardStatus[] = [];
  const slideParts = html.split('<div class="glide__slide" data-key="').slice(1);

  for (const part of slideParts) {
    const keyEndIndex = part.indexOf('"');
    if (keyEndIndex <= 0) {
      continue;
    }

    const key = part.slice(0, keyEndIndex).trim().toUpperCase();
    if (key.length === 0) {
      continue;
    }

    const blockEndIndex = part.indexOf("</a></div>");
    const block = blockEndIndex > 0 ? part.slice(0, blockEndIndex) : part;

    const titleMatch = block.match(
      /<div class="markets__item__title[^"]*">([\s\S]*?)<\/div>/i
    );
    const title = normalizeText(titleMatch?.[1] ?? "");

    let stateText = "";
    const statRegex =
      /<div class="markets__item__stat__label">([\s\S]*?)<\/div>\s*<div>([\s\S]*?)<\/div>/gi;
    let statMatch: RegExpExecArray | null = null;
    while (true) {
      statMatch = statRegex.exec(block);
      if (!statMatch) {
        break;
      }

      const label = normalizeText(statMatch[1] ?? "").toLowerCase();
      if (label !== "state") {
        continue;
      }

      stateText = normalizeStateText(statMatch[2] ?? "");
      break;
    }

    if (stateText.length === 0) {
      continue;
    }

    boards.push({
      key,
      title,
      stateText,
      uiStatus: mapStateToUiStatus(stateText),
    });
  }

  return boards;
}

function pickPrimaryBoard(boards: DpsMarketBoardStatus[]): DpsMarketBoardStatus | null {
  for (const priorityKey of PRIMARY_BOARD_PRIORITY) {
    const foundBoard = boards.find((board) => board.key === priorityKey);
    if (foundBoard) {
      return foundBoard;
    }
  }

  return boards[0] ?? null;
}

function parseLiveSnapshotFromHtml(html: string): DpsMarketStatusSnapshot | null {
  const boards = parseBoardsFromHtml(html);
  if (boards.length === 0) {
    return null;
  }

  const primaryBoard = pickPrimaryBoard(boards);
  if (!primaryBoard) {
    return null;
  }

  const stateText = normalizeStateText(primaryBoard.stateText);

  return {
    primaryBoardKey: primaryBoard.key,
    primaryBoardTitle: primaryBoard.title,
    stateText: stateText.length > 0 ? stateText : primaryBoard.uiStatus,
    uiStatus: primaryBoard.uiStatus,
    boards,
    fetchedAt: new Date().toISOString(),
    source: "live",
  };
}

async function fetchLiveMarketStatus(): Promise<DpsMarketStatusSnapshot> {
  const response = await fetch(DPS_HOME_URL, {
    headers: {
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`DPS market status endpoint failed with ${response.status}`);
  }

  const html = await response.text();
  const parsedSnapshot = parseLiveSnapshotFromHtml(html);
  if (!parsedSnapshot) {
    throw new Error("DPS market status could not be parsed.");
  }

  return parsedSnapshot;
}

export async function getCachedDpsMarketStatus(): Promise<DpsMarketStatusSnapshot> {
  const store = await readStore();
  if (!store.snapshot) {
    return getFallbackDpsMarketStatus("fallback");
  }

  return {
    ...toSafeSnapshot(store.snapshot, "cache"),
    source: "cache",
  };
}

export async function getLatestDpsMarketStatus(): Promise<DpsMarketStatusSnapshot> {
  const cachedSnapshot = await getCachedDpsMarketStatus();
  try {
    const liveSnapshot = await fetchLiveMarketStatus();
    await writeStore(liveSnapshot);
    return liveSnapshot;
  } catch {
    return cachedSnapshot;
  }
}

