import {
  getSavedDividendRecords,
  saveDividendRecord,
} from "@/src/features/dividend/dividend-records";
import { getInAppNotifications } from "@/src/features/notifications/in-app-notifications";
import {
  getPositionSnapshotForSymbolBeforeDate,
} from "@/src/features/portfolio/position-ledger";
import { getSavedBonusShareRecords } from "@/src/features/bonus-share/bonus-share-records";
import { getSavedTradeOrders } from "@/src/features/trade/trade-orders";
import {
  getAutoTaxDeductionEnabledPreference,
  getDeductTaxFromDividendEnabledPreference,
  getEffectiveDividendTaxRatePreference,
  getTaxpayerProfilePreference,
} from "@/src/lib/app-preferences";

const AUTO_DIVIDEND_SYNC_INTERVAL_MS = 10 * 60 * 1000;

const MONTH_INDEX_BY_NAME: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

let lastAutoDividendSyncTimestamp = 0;
let inFlightAutoDividendSync: Promise<number> | null = null;

function normalizeSymbol(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function normalizePerShare(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function parseDividendPerShareFromText(text: string): number {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return 0;
  }

  const perSharePatterns = [
    /rs\.?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/\s*share|\/=\s*per\s*share|per\s*share)/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:\/\s*share|\/=\s*per\s*share|per\s*share)/i,
  ];

  for (const pattern of perSharePatterns) {
    const match = normalized.match(pattern);
    const parsedAmount = Number(match?.[1] ?? "");
    if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
      return parsedAmount;
    }
  }

  return 0;
}

function buildIsoFromDateParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 0 || month > 11 || day < 1 || day > 31) {
    return null;
  }

  const parsedDate = new Date(year, month, day, 0, 0, 0, 0);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function parseFirstDateToIso(text: string): string | null {
  const normalized = text.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return null;
  }

  const yyyyMmDdMatch = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (yyyyMmDdMatch) {
    const year = Number(yyyyMmDdMatch[1]);
    const month = Number(yyyyMmDdMatch[2]) - 1;
    const day = Number(yyyyMmDdMatch[3]);
    return buildIsoFromDateParts(year, month, day);
  }

  const ddMmYyyyMatch = normalized.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (ddMmYyyyMatch) {
    const day = Number(ddMmYyyyMatch[1]);
    const month = Number(ddMmYyyyMatch[2]) - 1;
    let year = Number(ddMmYyyyMatch[3]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    return buildIsoFromDateParts(year, month, day);
  }

  const ddMonthYyyyMatch = normalized.match(
    /\b(\d{1,2})[\s/-]+([a-z]{3,9})[\s/-]+(\d{2,4})\b/i
  );
  if (ddMonthYyyyMatch) {
    const day = Number(ddMonthYyyyMatch[1]);
    const monthName = (ddMonthYyyyMatch[2] ?? "").slice(0, 3).toLowerCase();
    const month = MONTH_INDEX_BY_NAME[monthName];
    let year = Number(ddMonthYyyyMatch[3]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    if (typeof month === "number") {
      return buildIsoFromDateParts(year, month, day);
    }
  }

  return null;
}

function extractExDividendDateIso(message: string, fallbackOccurredAt: string | null): string | null {
  const normalizedMessage = message.replace(/\s+/g, " ").trim();
  if (normalizedMessage.length > 0) {
    const candidateMessageSegments = [
      normalizedMessage.match(/ex[-\s]?dividend[^•]*/i)?.[0] ?? null,
      normalizedMessage.match(/book\s*closure[^•]*/i)?.[0] ?? null,
      normalizedMessage.match(/book\s*close[^•]*/i)?.[0] ?? null,
      normalizedMessage.match(/closure[^•]*from[^•]*/i)?.[0] ?? null,
    ];

    for (const segment of candidateMessageSegments) {
      if (!segment) {
        continue;
      }

      const parsedSegmentDate = parseFirstDateToIso(segment);
      if (parsedSegmentDate) {
        return parsedSegmentDate;
      }
    }
  }

  if (!fallbackOccurredAt) {
    return null;
  }

  const parsedOccurredAt = new Date(fallbackOccurredAt);
  if (Number.isNaN(parsedOccurredAt.getTime())) {
    return null;
  }
  parsedOccurredAt.setHours(0, 0, 0, 0);
  return parsedOccurredAt.toISOString();
}

function buildAutoDividendKey(symbol: string, dividendDateIso: string, dividendPerShare: number): string {
  const dateKey = dividendDateIso.slice(0, 10);
  return `${symbol}|${dateKey}|${dividendPerShare.toFixed(6)}`;
}

export async function syncAutoDividendsFromNotifications(options?: {
  force?: boolean;
}): Promise<number> {
  const nowTimestamp = Date.now();
  if (
    !options?.force &&
    nowTimestamp - lastAutoDividendSyncTimestamp < AUTO_DIVIDEND_SYNC_INTERVAL_MS
  ) {
    return 0;
  }

  if (inFlightAutoDividendSync) {
    return inFlightAutoDividendSync;
  }

  lastAutoDividendSyncTimestamp = nowTimestamp;

  inFlightAutoDividendSync = (async () => {
    const [
      notifications,
      existingDividendRecords,
      tradeOrders,
      bonusShareRecords,
      taxpayerProfile,
      effectiveDividendTaxRatePct,
      autoTaxDeductionEnabled,
      deductTaxFromDividendEnabled,
    ] = await Promise.all([
      getInAppNotifications(),
      getSavedDividendRecords(),
      getSavedTradeOrders(),
      getSavedBonusShareRecords(),
      getTaxpayerProfilePreference(),
      getEffectiveDividendTaxRatePreference(),
      getAutoTaxDeductionEnabledPreference(),
      getDeductTaxFromDividendEnabledPreference(),
    ]);

    const existingAutoDividendKeys = new Set(
      existingDividendRecords.map((record) =>
        buildAutoDividendKey(record.symbol, record.dividendDate, record.dividendPerShare)
      )
    );
    const unitsBySymbolAndDate = new Map<string, number>();

    const payoutNotifications = notifications.filter((notification) => {
      return (
        notification.sourceKey === "payouts" &&
        normalizeSymbol(notification.symbol).length > 0 &&
        /dividend/i.test(notification.message)
      );
    });

    let createdCount = 0;
    for (const notification of payoutNotifications) {
      const symbol = normalizeSymbol(notification.symbol);
      if (symbol.length === 0) {
        continue;
      }

      const dividendPerShare = normalizePerShare(
        parseDividendPerShareFromText(notification.message)
      );
      if (dividendPerShare <= 0) {
        continue;
      }

      const exDividendDateIso = extractExDividendDateIso(
        notification.message,
        notification.occurredAt ?? notification.createdAt
      );
      if (!exDividendDateIso) {
        continue;
      }

      const autoDividendKey = buildAutoDividendKey(
        symbol,
        exDividendDateIso,
        dividendPerShare
      );
      if (existingAutoDividendKeys.has(autoDividendKey)) {
        continue;
      }

      const unitsCacheKey = `${symbol}|${exDividendDateIso}`;
      let eligibleUnits = unitsBySymbolAndDate.get(unitsCacheKey) ?? 0;
      if (eligibleUnits <= 0) {
        const positionSnapshot = getPositionSnapshotForSymbolBeforeDate(
          tradeOrders,
          bonusShareRecords,
          symbol,
          exDividendDateIso
        );
        eligibleUnits = Math.max(0, Math.floor(positionSnapshot.units));
        unitsBySymbolAndDate.set(unitsCacheKey, eligibleUnits);
      }

      if (eligibleUnits <= 0) {
        continue;
      }

      const grossAmount = eligibleUnits * dividendPerShare;
      if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
        continue;
      }

      const taxDeductionPct =
        autoTaxDeductionEnabled && deductTaxFromDividendEnabled
          ? effectiveDividendTaxRatePct
          : 0;
      const taxDeductionAmount = (grossAmount * taxDeductionPct) / 100;
      const finalAmount = grossAmount - taxDeductionAmount;
      if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
        continue;
      }

      try {
        await saveDividendRecord({
          symbol,
          shares: eligibleUnits,
          dividendPerShare,
          taxDeductionPct,
          taxDeductionAmount,
          zakatAmount: 0,
          grossAmount,
          finalAmount,
          taxpayerProfile,
          dividendDate: exDividendDateIso,
        });

        existingAutoDividendKeys.add(autoDividendKey);
        createdCount += 1;
      } catch {
        // Skip failed item to keep the sync loop resilient.
      }
    }

    return createdCount;
  })()
    .catch(() => 0)
    .finally(() => {
      inFlightAutoDividendSync = null;
    });

  return inFlightAutoDividendSync;
}
