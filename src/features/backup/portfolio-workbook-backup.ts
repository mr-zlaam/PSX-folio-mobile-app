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
import { getPortfolioHoldingsWithCachedQuotes } from "@/src/features/portfolio/portfolio-data";
import { getCashLedgerSnapshot } from "@/src/features/trade/cash-ledger";
import { emitPortfolioReset } from "@/src/features/trade/trade-events";
import {
  TradeOrderRecord,
  getSavedTradeOrders,
  replaceSavedTradeOrders,
} from "@/src/features/trade/trade-orders";

type RawEntity = "meta" | "trade" | "deposit" | "dividend" | "bonus";

type RawColumn =
  | "entity"
  | "id"
  | "createdAt"
  | "occurredAt"
  | "symbol"
  | "side"
  | "price"
  | "units"
  | "brokerMode"
  | "brokerName"
  | "brokerFeeType"
  | "brokerFeeValue"
  | "brokerFeePct"
  | "amount"
  | "note"
  | "shares"
  | "dividendPerShare"
  | "taxDeductionPct"
  | "taxDeductionAmount"
  | "zakatAmount"
  | "grossAmount"
  | "finalAmount"
  | "taxpayerProfile";

type RawRow = Partial<Record<RawColumn, string>>;

type BackupSnapshot = {
  exportedAt: string;
  trades: TradeOrderRecord[];
  deposits: DepositRecord[];
  dividends: DividendRecord[];
  bonuses: BonusShareRecord[];
  holdings: Awaited<ReturnType<typeof getPortfolioHoldingsWithCachedQuotes>>;
  freeCash: number;
};

export type WorkbookImportSummary = {
  trades: number;
  deposits: number;
  dividends: number;
  bonuses: number;
};

export type WorkbookExportSummary = {
  fileUri: string;
  fileName: string;
  rows: number;
};

const RAW_COLUMNS: readonly RawColumn[] = [
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
  "brokerFeeType",
  "brokerFeeValue",
  "brokerFeePct",
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
] as const;

const WORKBOOK_SCHEMA_VERSION = "3";

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

function escapeHtml(rawValue: string): string {
  return rawValue
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtml(rawValue: string): string {
  return rawValue
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => {
      const parsedCode = Number(code);
      return Number.isFinite(parsedCode) ? String.fromCharCode(parsedCode) : "";
    });
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatFixed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(digits);
}

function formatInt(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return Math.round(value).toString();
}

async function readBackupSnapshot(): Promise<BackupSnapshot> {
  const [trades, deposits, dividends, bonuses, holdings, cashLedger] =
    await Promise.all([
      getSavedTradeOrders(),
      getSavedDepositRecords(),
      getSavedDividendRecords(),
      getSavedBonusShareRecords(),
      getPortfolioHoldingsWithCachedQuotes(),
      getCashLedgerSnapshot(),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    trades,
    deposits,
    dividends,
    bonuses,
    holdings,
    freeCash: cashLedger.availableCash,
  };
}

function buildRawRows(snapshot: BackupSnapshot): RawRow[] {
  const rows: RawRow[] = [];

  rows.push({
    entity: "meta",
    note: "schemaVersion",
    amount: WORKBOOK_SCHEMA_VERSION,
  });
  rows.push({
    entity: "meta",
    note: "exportedAt",
    amount: snapshot.exportedAt,
  });

  for (const trade of snapshot.trades) {
    rows.push({
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
      brokerFeeType: trade.brokerFeeType,
      brokerFeeValue:
        typeof trade.brokerFeeValue === "number" ? String(trade.brokerFeeValue) : "",
      brokerFeePct:
        trade.brokerFeeType === "percentage" &&
        typeof trade.brokerFeeValue === "number"
          ? String(trade.brokerFeeValue)
          : "",
    });
  }

  for (const deposit of snapshot.deposits) {
    rows.push({
      entity: "deposit",
      id: deposit.id,
      createdAt: deposit.createdAt,
      occurredAt: deposit.depositedAt,
      amount: String(deposit.amount),
      note: deposit.note ?? "",
    });
  }

  for (const dividend of snapshot.dividends) {
    rows.push({
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
    });
  }

  for (const bonus of snapshot.bonuses) {
    rows.push({
      entity: "bonus",
      id: bonus.id,
      createdAt: bonus.createdAt,
      occurredAt: bonus.awardedAt,
      symbol: bonus.symbol,
      units: String(bonus.units),
    });
  }

  return rows;
}

function buildWorkbookHtml(snapshot: BackupSnapshot, rawRows: RawRow[]): string {
  const totalInvested = snapshot.holdings.reduce(
    (sum, holding) => sum + holding.invested,
    0
  );
  const totalMarketValue = snapshot.holdings.reduce(
    (sum, holding) => sum + holding.marketValue,
    0
  );
  const totalValue = totalMarketValue + snapshot.freeCash;
  const pnl = totalValue - totalInvested;
  const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;
  const latestAsOf = snapshot.holdings
    .map((holding) => holding.asOf)
    .filter((asOf): asOf is string => typeof asOf === "string")
    .sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0];

  const transactionRows = [
    ...snapshot.trades.map((trade) => ({
      type: "Trade",
      side: trade.side.toUpperCase(),
      symbol: trade.symbol,
      dateTime: trade.tradedAt,
      quantity: formatInt(trade.units),
      price: formatFixed(trade.price),
      amount:
        trade.side === "buy"
          ? formatFixed(-(trade.price * trade.units))
          : formatFixed(trade.price * trade.units),
      note:
        trade.brokerName?.trim().length
          ? `${trade.brokerName} (${trade.brokerMode})`
          : trade.brokerMode,
    })),
    ...snapshot.deposits.map((deposit) => ({
      type: "Deposit",
      side: "",
      symbol: "CASH",
      dateTime: deposit.depositedAt,
      quantity: "",
      price: "",
      amount: formatFixed(deposit.amount),
      note: deposit.note ?? "",
    })),
    ...snapshot.dividends.map((dividend) => ({
      type: "Dividend",
      side: "",
      symbol: dividend.symbol,
      dateTime: dividend.dividendDate,
      quantity: formatInt(dividend.shares),
      price: formatFixed(dividend.dividendPerShare),
      amount: formatFixed(dividend.finalAmount),
      note: `Tax ${formatFixed(dividend.taxDeductionPct, 2)}%`,
    })),
    ...snapshot.bonuses.map((bonus) => ({
      type: "Bonus",
      side: "",
      symbol: bonus.symbol,
      dateTime: bonus.awardedAt,
      quantity: formatInt(bonus.units),
      price: "",
      amount: "0.00",
      note: "Bonus Shares",
    })),
  ].sort(
    (first, second) =>
      new Date(second.dateTime).getTime() - new Date(first.dateTime).getTime()
  );

  const summaryTable = `
    <h2>Portfolio Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Portfolio Name</th>
          <th>Total Value (PKR)</th>
          <th>Total Invested (PKR)</th>
          <th>Market Value (PKR)</th>
          <th>Free Cash (PKR)</th>
          <th>P&amp;L (PKR)</th>
          <th>P&amp;L %</th>
          <th>Holdings Count</th>
          <th>Last Updated</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Personal</td>
          <td>${formatFixed(totalValue)}</td>
          <td>${formatFixed(totalInvested)}</td>
          <td>${formatFixed(totalMarketValue)}</td>
          <td>${formatFixed(snapshot.freeCash)}</td>
          <td>${formatFixed(pnl)}</td>
          <td>${formatFixed(pnlPct)}</td>
          <td>${snapshot.holdings.length}</td>
          <td>${formatDate(latestAsOf ?? snapshot.exportedAt)}</td>
        </tr>
      </tbody>
    </table>
  `;

  const holdingsTable = `
    <h2>Holdings</h2>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Company</th>
          <th>Sector</th>
          <th>Units</th>
          <th>Avg Buy Price</th>
          <th>Current Price</th>
          <th>Invested (PKR)</th>
          <th>Market Value (PKR)</th>
          <th>P&amp;L (PKR)</th>
          <th>Return %</th>
          <th>Quote Time</th>
        </tr>
      </thead>
      <tbody>
        ${
          snapshot.holdings.length === 0
            ? `
              <tr>
                <td colspan="11">No holdings available</td>
              </tr>
            `
            : snapshot.holdings
                .map(
                  (holding) => `
                    <tr>
                      <td>${escapeHtml(holding.symbol)}</td>
                      <td>${escapeHtml(holding.companyName)}</td>
                      <td>${escapeHtml(holding.sectorName)}</td>
                      <td>${formatFixed(holding.units, 4)}</td>
                      <td>${formatFixed(holding.averageBuyPrice)}</td>
                      <td>${formatFixed(holding.currentPrice)}</td>
                      <td>${formatFixed(holding.invested)}</td>
                      <td>${formatFixed(holding.marketValue)}</td>
                      <td>${formatFixed(holding.pnl)}</td>
                      <td>${formatFixed(holding.pnlPct)}</td>
                      <td>${escapeHtml(formatDateTime(holding.asOf))}</td>
                    </tr>
                  `
                )
                .join("")
        }
      </tbody>
    </table>
  `;

  const transactionsTable = `
    <h2>Transactions</h2>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Side</th>
          <th>Symbol</th>
          <th>Date Time</th>
          <th>Quantity</th>
          <th>Price (PKR)</th>
          <th>Amount (PKR)</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${
          transactionRows.length === 0
            ? `
              <tr>
                <td colspan="8">No transactions available</td>
              </tr>
            `
            : transactionRows
                .map(
                  (transaction) => `
                    <tr>
                      <td>${escapeHtml(transaction.type)}</td>
                      <td>${escapeHtml(transaction.side)}</td>
                      <td>${escapeHtml(transaction.symbol)}</td>
                      <td>${escapeHtml(formatDateTime(transaction.dateTime))}</td>
                      <td>${escapeHtml(transaction.quantity)}</td>
                      <td>${escapeHtml(transaction.price)}</td>
                      <td>${escapeHtml(transaction.amount)}</td>
                      <td>${escapeHtml(transaction.note)}</td>
                    </tr>
                  `
                )
                .join("")
        }
      </tbody>
    </table>
  `;

  const rawTable = `
    <div id="psx-backup-raw-wrap" style="display:none;">
      <table id="psx-backup-raw">
        <thead>
          <tr>
            ${RAW_COLUMNS.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rawRows
            .map(
              (row) => `
                <tr>
                  ${RAW_COLUMNS.map((column) =>
                    `<td>${escapeHtml(row[column] ?? "")}</td>`
                  ).join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="generator" content="PSX Portfolio Backup Workbook" />
    <style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 12px; color: #0F172A; margin: 14px; }
      h1 { margin: 0 0 8px; font-size: 24px; color: #111827; }
      h2 { margin: 18px 0 8px; font-size: 16px; color: #111827; }
      .meta { color: #475569; margin-bottom: 6px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 14px; table-layout: fixed; }
      th, td { border: 1px solid #CBD5E1; padding: 6px 8px; text-align: left; vertical-align: top; word-wrap: break-word; }
      th { background: #E2E8F0; font-weight: 700; color: #0F172A; }
      tr:nth-child(even) td { background: #F8FAFC; }
    </style>
  </head>
  <body>
    <h1>PSX Portfolio Backup</h1>
    <div class="meta">Exported At: ${escapeHtml(formatDateTime(snapshot.exportedAt))}</div>
    <div class="meta">Schema Version: ${escapeHtml(WORKBOOK_SCHEMA_VERSION)}</div>
    ${summaryTable}
    ${holdingsTable}
    ${transactionsTable}
    ${rawTable}
  </body>
</html>`;
}

function parseRawTableFromWorkbookHtml(workbookHtml: string): string[][] {
  const tableMatch = workbookHtml.match(
    /<table[^>]*id=["']psx-backup-raw["'][^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) {
    throw new Error("Backup data table not found in workbook file.");
  }

  const tableContent = tableMatch[1];
  const rowMatches = tableContent.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const rows: string[][] = [];

  for (const rowHtml of rowMatches) {
    const cellMatches = rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
    const cells = cellMatches.map((cellHtml) => {
      const innerValue = cellHtml
        .replace(/^<t[dh][^>]*>/i, "")
        .replace(/<\/t[dh]>$/i, "")
        .replace(/<[^>]+>/g, "");
      return decodeHtml(innerValue).trim();
    });

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length < 1) {
    throw new Error("Workbook backup is empty.");
  }

  return rows;
}

function parseFlatRows(parsedRows: string[][]): {
  trades: TradeOrderRecord[];
  deposits: DepositRecord[];
  dividends: DividendRecord[];
  bonuses: BonusShareRecord[];
} {
  const headerCells = parsedRows[0].map((cell) => cell.replace(/^\uFEFF/, ""));
  const columnIndex = new Map<string, number>();
  headerCells.forEach((column, index) => {
    columnIndex.set(column, index);
  });

  const getCell = (row: string[], column: RawColumn): string => {
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

  for (let rowIndex = 1; rowIndex < parsedRows.length; rowIndex += 1) {
    const row = parsedRows[rowIndex];
    const entityValue = getCell(row, "entity").trim().toLowerCase() as RawEntity;

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
      const brokerFeeTypeRaw = getCell(row, "brokerFeeType").trim();
      const brokerFeeValueRaw = parseFiniteNumber(getCell(row, "brokerFeeValue"));
      const brokerFeePct = parseFiniteNumber(getCell(row, "brokerFeePct"));
      const brokerFeeType =
        brokerFeeTypeRaw === "fixed" || brokerFeeTypeRaw === "percentage"
          ? brokerFeeTypeRaw
          : "percentage";
      const brokerFeeValue =
        brokerFeeValueRaw === null ? (brokerFeePct === null ? 0 : brokerFeePct) : brokerFeeValueRaw;

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
        brokerFeeType,
        brokerFeeValue,
      });
      continue;
    }

    if (entityValue === "deposit") {
      const id = getCell(row, "id").trim();
      const createdAt = getCell(row, "createdAt").trim();
      const depositedAt = getCell(row, "occurredAt").trim();
      const amount = parseFiniteNumber(getCell(row, "amount"));
      const noteRaw = getCell(row, "note").trim();

      if (
        id.length === 0 ||
        createdAt.length === 0 ||
        depositedAt.length === 0 ||
        amount === null ||
        amount <= 0
      ) {
        continue;
      }

      deposits.push({
        id,
        createdAt,
        depositedAt,
        amount,
        note: noteRaw.length > 0 ? noteRaw : null,
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
        finalAmount < 0 ||
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
    }
  }

  return {
    trades,
    deposits,
    dividends,
    bonuses,
  };
}

export async function exportPortfolioWorkbookBackup(): Promise<WorkbookExportSummary> {
  const snapshot = await readBackupSnapshot();
  const rawRows = buildRawRows(snapshot);
  const workbookHtml = buildWorkbookHtml(snapshot, rawRows);

  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory) {
    throw new Error("Unable to access local storage directory.");
  }

  const timestampSafe = snapshot.exportedAt.replace(/[:.]/g, "-");
  const fileName = `psx-folio-portfolio-backup-${timestampSafe}.xls`;
  const fileUri = `${baseDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, workbookHtml);

  return {
    fileUri,
    fileName,
    rows: rawRows.length,
  };
}

async function importWorkbookContent(workbookContent: string): Promise<WorkbookImportSummary> {
  const parsedRows = parseRawTableFromWorkbookHtml(workbookContent);
  const parsed = parseFlatRows(parsedRows);

  await Promise.all([
    replaceSavedTradeOrders(parsed.trades),
    replaceSavedDepositRecords(parsed.deposits),
    replaceSavedDividendRecords(parsed.dividends),
    replaceSavedBonusShareRecords(parsed.bonuses),
  ]);

  emitPortfolioReset({
    createdAt: new Date().toISOString(),
  });

  return {
    trades: parsed.trades.length,
    deposits: parsed.deposits.length,
    dividends: parsed.dividends.length,
    bonuses: parsed.bonuses.length,
  };
}

export async function importPortfolioWorkbookBackupFromFile(
  fileUri: string
): Promise<WorkbookImportSummary> {
  let workbookContent = "";
  try {
    workbookContent = await FileSystem.readAsStringAsync(fileUri);
  } catch {
    throw new Error("Unable to read backup file.");
  }

  const normalizedContent = workbookContent.toLowerCase();
  const looksLikeWorkbook =
    normalizedContent.includes("psx-backup-raw") &&
    normalizedContent.includes("<table");

  if (!looksLikeWorkbook) {
    throw new Error(
      "Unsupported backup format. Please select an XLS backup exported from this app."
    );
  }

  return importWorkbookContent(workbookContent);
}
