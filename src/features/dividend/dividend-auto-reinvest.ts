import {
  getCachedSymbolQuote,
  getLatestSymbolQuote,
} from "@/src/features/trade/trade-data";
import { saveTradeOrder, TradeOrderRecord } from "@/src/features/trade/trade-orders";
import { getDividendAutoReinvestEnabledPreference } from "@/src/lib/app-preferences";

type AutoReinvestSkippedReason =
  | "disabled"
  | "amount-too-low"
  | "price-unavailable"
  | "save-failed";

export type DividendAutoReinvestResult =
  | {
      reinvested: true;
      priceUsed: number;
      unitsBought: number;
      investedAmount: number;
      leftoverCash: number;
      createdTrade: TradeOrderRecord;
    }
  | {
      reinvested: false;
      reason: AutoReinvestSkippedReason;
      priceUsed: number;
      unitsBought: 0;
      investedAmount: 0;
      leftoverCash: number;
    };

function toPositiveFiniteNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function resolveValidPrice(prices: number[]): number {
  for (const candidatePrice of prices) {
    const normalized = toPositiveFiniteNumber(candidatePrice);
    if (normalized > 0) {
      return normalized;
    }
  }
  return 0;
}

export async function maybeAutoReinvestDividend(args: {
  symbol: string;
  finalAmount: number;
  dividendDate: string;
}): Promise<DividendAutoReinvestResult> {
  const autoReinvestEnabled = await getDividendAutoReinvestEnabledPreference();
  const normalizedFinalAmount = toPositiveFiniteNumber(args.finalAmount);
  const normalizedSymbol = normalizeSymbol(args.symbol);

  if (!autoReinvestEnabled) {
    return {
      reinvested: false,
      reason: "disabled",
      priceUsed: 0,
      unitsBought: 0,
      investedAmount: 0,
      leftoverCash: normalizedFinalAmount,
    };
  }

  if (normalizedFinalAmount <= 0 || normalizedSymbol.length === 0) {
    return {
      reinvested: false,
      reason: "amount-too-low",
      priceUsed: 0,
      unitsBought: 0,
      investedAmount: 0,
      leftoverCash: normalizedFinalAmount,
    };
  }

  const latestQuote = await getLatestSymbolQuote(normalizedSymbol);
  const cachedQuote = await getCachedSymbolQuote(normalizedSymbol);
  const priceUsed = resolveValidPrice([
    latestQuote.lastPrice,
    latestQuote.previousClose,
    cachedQuote?.lastPrice ?? 0,
    cachedQuote?.previousClose ?? 0,
  ]);

  if (priceUsed <= 0) {
    return {
      reinvested: false,
      reason: "price-unavailable",
      priceUsed: 0,
      unitsBought: 0,
      investedAmount: 0,
      leftoverCash: normalizedFinalAmount,
    };
  }

  const unitsBought = Math.floor(normalizedFinalAmount / priceUsed);
  if (unitsBought <= 0) {
    return {
      reinvested: false,
      reason: "amount-too-low",
      priceUsed,
      unitsBought: 0,
      investedAmount: 0,
      leftoverCash: normalizedFinalAmount,
    };
  }

  const investedAmount = unitsBought * priceUsed;
  const leftoverCash = normalizedFinalAmount - investedAmount;

  try {
    const createdTrade = await saveTradeOrder({
      side: "buy",
      symbol: normalizedSymbol,
      price: priceUsed,
      units: unitsBought,
      tradedAt: args.dividendDate,
      brokerMode: "custom",
      brokerName: "Dividend Reinvest",
      brokerFeeType: "fixed",
      brokerFeeValue: 0,
    });

    return {
      reinvested: true,
      priceUsed,
      unitsBought,
      investedAmount,
      leftoverCash,
      createdTrade,
    };
  } catch {
    return {
      reinvested: false,
      reason: "save-failed",
      priceUsed,
      unitsBought: 0,
      investedAmount: 0,
      leftoverCash: normalizedFinalAmount,
    };
  }
}
