import * as FileSystem from "expo-file-system/legacy";
import {
  BonusShareRecord,
  getSavedBonusShareRecords,
  replaceSavedBonusShareRecords,
} from "@/src/features/bonus-share/bonus-share-records";
import {
  DepositRecord,
  getSavedDepositRecords,
  replaceSavedDepositRecords,
} from "@/src/features/deposit/deposit-records";
import {
  DividendRecord,
  getSavedDividendRecords,
  replaceSavedDividendRecords,
} from "@/src/features/dividend/dividend-records";
import {
  TradeOrderRecord,
  getSavedTradeOrders,
  replaceSavedTradeOrders,
} from "@/src/features/trade/trade-orders";
import { emitPortfolioReset } from "@/src/features/trade/trade-events";
import {
  WatchlistItem,
  getSavedWatchlistItems,
  replaceSavedWatchlistItems,
} from "@/src/features/watchlist/watchlist-store";
import {
  clearBrokerSettings,
  clearThemePreference,
  getBrokerSettings,
  getCashGuardEnabledPreference,
  getHomeInsightDisplayModePreference,
  getOnboardingComplete,
  getPortfolioDisplayModePreference,
  getPortfolioGroupingModePreference,
  getTaxpayerProfilePreference,
  getThemePreference,
  setBrokerSettings,
  setCashGuardEnabledPreference,
  setHomeInsightDisplayModePreference,
  setOnboardingComplete,
  setPortfolioDisplayModePreference,
  setPortfolioGroupingModePreference,
  setTaxpayerProfilePreference,
  setThemePreference,
} from "@/src/lib/app-preferences";

type CsvEntity =
  | "meta"
  | "trade"
  | "deposit"
  | "dividend"
  | "bonus"
  | "watchlist"
  | "preference";

type BackupSnapshot = {
  exportedAt: string;
  trades: TradeOrderRecord[];
  deposits: DepositRecord[];
  dividends: DividendRecord[];
  bonuses: BonusShareRecord[];
  watchlist: WatchlistItem[];
  preferences: Record<string, string>;
};

export type CsvImportSummary = {
  trades: number;
  deposits: number;
  dividends: number;
  bonuses: number;
  watchlist: number;
  preferences: number;
};

export type CsvExportSummary = {
  fileUri: string;
  fileName: string;
  rows: number;
};

const CSV_SCHEMA_VERSION = "1";
const CSV_COLUMNS = [
  "entity",
  "id",
  "createdAt",
  "occurredAt",
  "symbol",
  "side",
  "price",
  "units",
  "brokerMode",
  "brokerName",
  "brokerFeePct",
  "cashGuardApplied",
  "amount",
  "note",
  "shares",
  "dividendPerShare",
  "taxDeductionPct",
  "taxDeductionAmount",
  "zakatAmount",
  "grossAmount",
  "finalAmount",
  "taxpayerProfile",
  "watchlistAddedAt",
  "settingKey",
  "settingValue",
] as const;

type CsvColumn = (typeof CSV_COLUMNS)[number];
type CsvRow = Partial<Record<CsvColumn, string>>;

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function parseFiniteNumber(value: string): number | null {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return parsedValue;
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return null;
}

function formatCsvCell(rawValue: string): string {
  if (rawValue.includes("\"")) {
    const escaped = rawValue.replace(/"/g, "\"\"");
    return `"${escaped}"`;
  }

  if (rawValue.includes(",") || rawValue.includes("\n") || rawValue.includes("\r")) {
    return `"${rawValue}"`;
  }

  return rawValue;
}

function serializeCsvRow(row: CsvRow): string {
  return CSV_COLUMNS.map((column) => formatCsvCell(row[column] ?? "")).join(",");
}

function parseCsvRows(csvContent: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < csvContent.length; index += 1) {
    const currentChar = csvContent[index];
    const nextChar = csvContent[index + 1];

    if (currentChar === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (currentChar === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((currentChar === "\n" || currentChar === "\r") && !inQuotes) {
      if (currentChar === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += currentChar;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

async function readBackupSnapshot(): Promise<BackupSnapshot> {
  const [
    trades,
    deposits,
    dividends,
    bonuses,
    watchlist,
    onboardingComplete,
    themePreference,
    homeInsightDisplayMode,
    portfolioGroupingMode,
    portfolioDisplayMode,
    taxpayerProfile,
    cashGuardEnabled,
    brokerSettings,
  ] = await Promise.all([
    getSavedTradeOrders(),
    getSavedDepositRecords(),
    getSavedDividendRecords(),
    getSavedBonusShareRecords(),
    getSavedWatchlistItems(),
    getOnboardingComplete(),
    getThemePreference(),
    getHomeInsightDisplayModePreference(),
    getPortfolioGroupingModePreference(),
    getPortfolioDisplayModePreference(),
    getTaxpayerProfilePreference(),
    getCashGuardEnabledPreference(),
    getBrokerSettings(),
  ]);

  const preferences: Record<string, string> = {
    onboardingComplete: String(onboardingComplete),
    homeInsightDisplayMode,
    portfolioGroupingMode,
    portfolioDisplayMode,
    taxpayerProfile,
    cashGuardEnabled: String(cashGuardEnabled),
  };

  if (themePreference) {
    preferences.themePreference = themePreference;
  }

  if (brokerSettings) {
    preferences.brokerName = brokerSettings.brokerName;
    preferences.brokerFeePct = String(brokerSettings.transactionFeePct);
  }

  return {
    exportedAt: new Date().toISOString(),
    trades,
    deposits,
    dividends,
    bonuses,
    watchlist,
    preferences,
  };
}

function buildCsvContent(snapshot: BackupSnapshot): string {
  const rows: string[] = [serializeCsvRow(Object.fromEntries(CSV_COLUMNS.map((column) => [column, column])) as CsvRow)];

  rows.push(
    serializeCsvRow({
      entity: "meta",
      settingKey: "schemaVersion",
      settingValue: CSV_SCHEMA_VERSION,
    })
  );
  rows.push(
    serializeCsvRow({
      entity: "meta",
      settingKey: "exportedAt",
      settingValue: snapshot.exportedAt,
    })
  );

  for (const trade of snapshot.trades) {
    rows.push(
      serializeCsvRow({
        entity: "trade",
        id: trade.id,
        createdAt: trade.createdAt,
        occurredAt: trade.tradedAt,
        symbol: trade.symbol,
        side: trade.side,
        price: String(trade.price),
        units: String(trade.units),
        brokerMode: trade.brokerMode,
        brokerName: trade.brokerName ?? "",
        brokerFeePct:
          typeof trade.brokerFeePct === "number" ? String(trade.brokerFeePct) : "",
        cashGuardApplied:
          typeof trade.cashGuardApplied === "boolean"
            ? String(trade.cashGuardApplied)
            : "",
      })
    );
  }

  for (const deposit of snapshot.deposits) {
    rows.push(
      serializeCsvRow({
        entity: "deposit",
        id: deposit.id,
        createdAt: deposit.createdAt,
        occurredAt: deposit.depositedAt,
        amount: String(deposit.amount),
        note: deposit.note ?? "",
      })
    );
  }

  for (const dividend of snapshot.dividends) {
    rows.push(
      serializeCsvRow({
        entity: "dividend",
        id: dividend.id,
        createdAt: dividend.createdAt,
        occurredAt: dividend.dividendDate,
        symbol: dividend.symbol,
        shares: String(dividend.shares),
        dividendPerShare: String(dividend.dividendPerShare),
        taxDeductionPct: String(dividend.taxDeductionPct),
        taxDeductionAmount: String(dividend.taxDeductionAmount),
        zakatAmount: String(dividend.zakatAmount),
        grossAmount: String(dividend.grossAmount),
        finalAmount: String(dividend.finalAmount),
        taxpayerProfile: dividend.taxpayerProfile,
      })
    );
  }

  for (const bonus of snapshot.bonuses) {
    rows.push(
      serializeCsvRow({
        entity: "bonus",
        id: bonus.id,
        createdAt: bonus.createdAt,
        occurredAt: bonus.awardedAt,
        symbol: bonus.symbol,
        units: String(bonus.units),
      })
    );
  }

  for (const item of snapshot.watchlist) {
    rows.push(
      serializeCsvRow({
        entity: "watchlist",
        symbol: item.symbol,
        watchlistAddedAt: item.addedAt,
      })
    );
  }

  for (const [settingKey, settingValue] of Object.entries(snapshot.preferences)) {
    rows.push(
      serializeCsvRow({
        entity: "preference",
        settingKey,
        settingValue,
      })
    );
  }

  return rows.join("\n");
}

function parseCsvContent(csvContent: string): {
  trades: TradeOrderRecord[];
  deposits: DepositRecord[];
  dividends: DividendRecord[];
  bonuses: BonusShareRecord[];
  watchlist: WatchlistItem[];
  preferences: Record<string, string>;
} {
  const parsedRows = parseCsvRows(csvContent);
  if (parsedRows.length < 1) {
    throw new Error("CSV file is empty.");
  }

  const headerCells = parsedRows[0].map((cell) => cell.replace(/^\uFEFF/, ""));
  const columnIndex = new Map<string, number>();
  headerCells.forEach((column, index) => {
    columnIndex.set(column, index);
  });

  const getCell = (row: string[], column: CsvColumn): string => {
    const index = columnIndex.get(column);
    if (typeof index !== "number") {
      return "";
    }
    return row[index] ?? "";
  };

  const trades: TradeOrderRecord[] = [];
  const deposits: DepositRecord[] = [];
  const dividends: DividendRecord[] = [];
  const bonuses: BonusShareRecord[] = [];
  const watchlist: WatchlistItem[] = [];
  const preferences: Record<string, string> = {};

  for (let rowIndex = 1; rowIndex < parsedRows.length; rowIndex += 1) {
    const row = parsedRows[rowIndex];
    const entityValue = getCell(row, "entity").trim().toLowerCase() as CsvEntity;

    if (entityValue === "trade") {
      const id = getCell(row, "id").trim();
      const createdAt = getCell(row, "createdAt").trim();
      const tradedAt = getCell(row, "occurredAt").trim();
      const symbol = normalizeSymbol(getCell(row, "symbol"));
      const sideRaw = getCell(row, "side").trim();
      const brokerModeRaw = getCell(row, "brokerMode").trim();
      const price = parseFiniteNumber(getCell(row, "price"));
      const units = parseFiniteNumber(getCell(row, "units"));

      if (
        id.length === 0 ||
        createdAt.length === 0 ||
        tradedAt.length === 0 ||
        symbol.length === 0 ||
        (sideRaw !== "buy" && sideRaw !== "sell") ||
        (brokerModeRaw !== "saved" && brokerModeRaw !== "custom") ||
        price === null ||
        price <= 0 ||
        units === null ||
        units <= 0
      ) {
        continue;
      }

      const brokerNameRaw = getCell(row, "brokerName").trim();
      const brokerFeePct = parseFiniteNumber(getCell(row, "brokerFeePct"));
      const cashGuardApplied =
        parseBoolean(getCell(row, "cashGuardApplied")) ?? true;

      trades.push({
        id,
        createdAt,
        tradedAt,
        symbol,
        side: sideRaw,
        price,
        units: Math.round(units),
        brokerMode: brokerModeRaw,
        brokerName: brokerNameRaw.length > 0 ? brokerNameRaw : null,
        brokerFeePct: brokerFeePct === null ? null : brokerFeePct,
        cashGuardApplied,
      });
      continue;
    }

    if (entityValue === "deposit") {
      const id = getCell(row, "id").trim();
      const createdAt = getCell(row, "createdAt").trim();
      const depositedAt = getCell(row, "occurredAt").trim();
      const amount = parseFiniteNumber(getCell(row, "amount"));
      const noteRaw = getCell(row, "note");

      if (
        id.length === 0 ||
        createdAt.length === 0 ||
        depositedAt.length === 0 ||
        amount === null ||
        amount <= 0
      ) {
        continue;
      }

      const normalizedNote = noteRaw.trim();
      deposits.push({
        id,
        createdAt,
        depositedAt,
        amount,
        note: normalizedNote.length > 0 ? normalizedNote : null,
      });
      continue;
    }

    if (entityValue === "dividend") {
      const id = getCell(row, "id").trim();
      const createdAt = getCell(row, "createdAt").trim();
      const dividendDate = getCell(row, "occurredAt").trim();
      const symbol = normalizeSymbol(getCell(row, "symbol"));
      const shares = parseFiniteNumber(getCell(row, "shares"));
      const dividendPerShare = parseFiniteNumber(getCell(row, "dividendPerShare"));
      const taxDeductionPct = parseFiniteNumber(getCell(row, "taxDeductionPct"));
      const taxDeductionAmount = parseFiniteNumber(getCell(row, "taxDeductionAmount"));
      const zakatAmount = parseFiniteNumber(getCell(row, "zakatAmount"));
      const grossAmount = parseFiniteNumber(getCell(row, "grossAmount"));
      const finalAmount = parseFiniteNumber(getCell(row, "finalAmount"));
      const taxpayerProfileRaw = getCell(row, "taxpayerProfile").trim();

      if (
        id.length === 0 ||
        createdAt.length === 0 ||
        dividendDate.length === 0 ||
        symbol.length === 0 ||
        shares === null ||
        shares <= 0 ||
        dividendPerShare === null ||
        dividendPerShare <= 0 ||
        taxDeductionPct === null ||
        taxDeductionPct < 0 ||
        taxDeductionAmount === null ||
        taxDeductionAmount < 0 ||
        zakatAmount === null ||
        zakatAmount < 0 ||
        grossAmount === null ||
        grossAmount <= 0 ||
        finalAmount === null ||
        finalAmount <= 0 ||
        (taxpayerProfileRaw !== "filer" && taxpayerProfileRaw !== "nonFiler")
      ) {
        continue;
      }

      dividends.push({
        id,
        createdAt,
        symbol,
        shares: Math.round(shares),
        dividendPerShare,
        taxDeductionPct,
        taxDeductionAmount,
        zakatAmount,
        grossAmount,
        finalAmount,
        taxpayerProfile: taxpayerProfileRaw,
        dividendDate,
      });
      continue;
    }

    if (entityValue === "bonus") {
      const id = getCell(row, "id").trim();
      const createdAt = getCell(row, "createdAt").trim();
      const awardedAt = getCell(row, "occurredAt").trim();
      const symbol = normalizeSymbol(getCell(row, "symbol"));
      const units = parseFiniteNumber(getCell(row, "units"));

      if (
        id.length === 0 ||
        createdAt.length === 0 ||
        awardedAt.length === 0 ||
        symbol.length === 0 ||
        units === null ||
        units <= 0
      ) {
        continue;
      }

      bonuses.push({
        id,
        createdAt,
        symbol,
        units: Math.round(units),
        awardedAt,
      });
      continue;
    }

    if (entityValue === "watchlist") {
      const symbol = normalizeSymbol(getCell(row, "symbol"));
      const addedAt = getCell(row, "watchlistAddedAt").trim();
      if (symbol.length === 0 || addedAt.length === 0) {
        continue;
      }

      watchlist.push({
        symbol,
        addedAt,
      });
      continue;
    }

    if (entityValue === "preference") {
      const settingKey = getCell(row, "settingKey").trim();
      const settingValue = getCell(row, "settingValue");
      if (settingKey.length === 0) {
        continue;
      }
      preferences[settingKey] = settingValue;
    }
  }

  return {
    trades,
    deposits,
    dividends,
    bonuses,
    watchlist,
    preferences,
  };
}

async function applyPreferences(preferences: Record<string, string>): Promise<void> {
  const onboardingComplete =
    parseBoolean(preferences.onboardingComplete ?? "") ?? false;
  await setOnboardingComplete(onboardingComplete);

  const themePreference = (preferences.themePreference ?? "").trim();
  if (themePreference === "light" || themePreference === "dark") {
    await setThemePreference(themePreference);
  } else {
    await clearThemePreference();
  }

  const homeInsightDisplayMode = (preferences.homeInsightDisplayMode ?? "").trim();
  if (homeInsightDisplayMode === "percentage" || homeInsightDisplayMode === "price") {
    await setHomeInsightDisplayModePreference(homeInsightDisplayMode);
  } else {
    await setHomeInsightDisplayModePreference("percentage");
  }

  const portfolioGroupingMode = (preferences.portfolioGroupingMode ?? "").trim();
  if (portfolioGroupingMode === "sectors" || portfolioGroupingMode === "companies") {
    await setPortfolioGroupingModePreference(portfolioGroupingMode);
  } else {
    await setPortfolioGroupingModePreference("sectors");
  }

  const portfolioDisplayMode = (preferences.portfolioDisplayMode ?? "").trim();
  if (portfolioDisplayMode === "percentage" || portfolioDisplayMode === "price") {
    await setPortfolioDisplayModePreference(portfolioDisplayMode);
  } else {
    await setPortfolioDisplayModePreference("percentage");
  }

  const taxpayerProfile = (preferences.taxpayerProfile ?? "").trim();
  if (taxpayerProfile === "filer" || taxpayerProfile === "nonFiler") {
    await setTaxpayerProfilePreference(taxpayerProfile);
  } else {
    await setTaxpayerProfilePreference("nonFiler");
  }

  const cashGuardEnabled = parseBoolean(preferences.cashGuardEnabled ?? "") ?? false;
  await setCashGuardEnabledPreference(cashGuardEnabled);

  const brokerName = (preferences.brokerName ?? "").trim();
  const brokerFeePct = parseFiniteNumber(preferences.brokerFeePct ?? "");
  if (brokerName.length > 0 && brokerFeePct !== null && brokerFeePct >= 0) {
    await setBrokerSettings({
      brokerName,
      transactionFeePct: brokerFeePct,
    });
  } else {
    await clearBrokerSettings();
  }
}

export async function exportPortfolioCsvBackup(): Promise<CsvExportSummary> {
  const snapshot = await readBackupSnapshot();
  const csvContent = buildCsvContent(snapshot);

  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory) {
    throw new Error("Unable to access local storage directory.");
  }

  const timestampSafe = snapshot.exportedAt.replace(/[:.]/g, "-");
  const fileName = `psx-folio-backup-${timestampSafe}.csv`;
  const fileUri = `${baseDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, csvContent);

  return {
    fileUri,
    fileName,
    rows: parseCsvRows(csvContent).length - 1,
  };
}

export async function importPortfolioCsvBackupFromContent(
  csvContent: string
): Promise<CsvImportSummary> {
  const parsed = parseCsvContent(csvContent);

  await Promise.all([
    replaceSavedTradeOrders(parsed.trades),
    replaceSavedDepositRecords(parsed.deposits),
    replaceSavedDividendRecords(parsed.dividends),
    replaceSavedBonusShareRecords(parsed.bonuses),
    replaceSavedWatchlistItems(parsed.watchlist),
  ]);

  await applyPreferences(parsed.preferences);

  emitPortfolioReset({
    createdAt: new Date().toISOString(),
  });

  return {
    trades: parsed.trades.length,
    deposits: parsed.deposits.length,
    dividends: parsed.dividends.length,
    bonuses: parsed.bonuses.length,
    watchlist: parsed.watchlist.length,
    preferences: Object.keys(parsed.preferences).length,
  };
}

export async function importPortfolioCsvBackupFromFile(
  fileUri: string
): Promise<CsvImportSummary> {
  const rawCsvContent = await FileSystem.readAsStringAsync(fileUri);
  return importPortfolioCsvBackupFromContent(rawCsvContent);
}
