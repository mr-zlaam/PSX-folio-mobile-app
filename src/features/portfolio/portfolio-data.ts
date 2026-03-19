import { getSavedTradeOrders, TradeOrderRecord } from "@/src/features/trade/trade-orders";
import {
  getCachedSymbols,
  getCachedSymbolQuote,
  getLatestSymbols,
  getLatestSymbolQuote,
  getSymbolQuoteFallback,
  PsxSymbol,
  SymbolQuote,
} from "@/src/features/trade/trade-data";

type QuoteMode = "cache" | "latest";

type PositionAccumulator = {
  symbol: string;
  units: number;
  averageBuyPrice: number;
};

export type PortfolioHolding = {
  symbol: string;
  companyName: string;
  sectorName: string;
  units: number;
  averageBuyPrice: number;
  invested: number;
  currentPrice: number;
  previousClose: number;
  highPrice: number;
  lowPrice: number;
  lastVolume: number;
  asOf: string | null;
  marketValue: number;
  priceDiff: number;
  priceDiffPct: number;
  pnl: number;
  pnlPct: number;
  quoteSource: SymbolQuote["source"];
};

function sortOrdersChronologically(orders: TradeOrderRecord[]): TradeOrderRecord[] {
  return [...orders].sort((firstOrder, secondOrder) => {
    const firstTimestamp = new Date(firstOrder.tradedAt).getTime();
    const secondTimestamp = new Date(secondOrder.tradedAt).getTime();

    if (firstTimestamp !== secondTimestamp) {
      return firstTimestamp - secondTimestamp;
    }

    return firstOrder.createdAt.localeCompare(secondOrder.createdAt);
  });
}

function toPositiveFiniteNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function buildPositionAccumulators(
  orders: TradeOrderRecord[]
): PositionAccumulator[] {
  const bySymbol = new Map<string, PositionAccumulator>();
  const sortedOrders = sortOrdersChronologically(orders);

  for (const order of sortedOrders) {
    const normalizedSymbol = order.symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      continue;
    }

    const safeUnits = toPositiveFiniteNumber(order.units);
    const safePrice = toPositiveFiniteNumber(order.price);
    if (safeUnits === 0 || safePrice === 0) {
      continue;
    }

    const currentPosition = bySymbol.get(normalizedSymbol) ?? {
      symbol: normalizedSymbol,
      units: 0,
      averageBuyPrice: 0,
    };

    if (order.side === "buy") {
      const existingCost = currentPosition.units * currentPosition.averageBuyPrice;
      const nextUnits = currentPosition.units + safeUnits;
      const nextCost = existingCost + safeUnits * safePrice;

      currentPosition.units = nextUnits;
      currentPosition.averageBuyPrice = nextUnits > 0 ? nextCost / nextUnits : 0;
      bySymbol.set(normalizedSymbol, currentPosition);
      continue;
    }

    // Sell reduces units against current holding. We cap at zero units.
    const sellableUnits = Math.min(currentPosition.units, safeUnits);
    currentPosition.units -= sellableUnits;

    if (currentPosition.units <= 0) {
      currentPosition.units = 0;
      currentPosition.averageBuyPrice = 0;
    }

    bySymbol.set(normalizedSymbol, currentPosition);
  }

  return Array.from(bySymbol.values()).filter((position) => position.units > 0);
}

async function readQuoteForSymbol(
  symbol: string,
  quoteMode: QuoteMode
): Promise<SymbolQuote> {
  if (quoteMode === "cache") {
    const cachedQuote = await getCachedSymbolQuote(symbol);
    return cachedQuote ?? getSymbolQuoteFallback(symbol);
  }

  return getLatestSymbolQuote(symbol);
}

async function readSymbolsByCode(
  quoteMode: QuoteMode
): Promise<Map<string, PsxSymbol>> {
  const symbols =
    quoteMode === "cache"
      ? await getCachedSymbols()
      : await getLatestSymbols();

  return new Map(
    symbols.map((symbolItem) => [symbolItem.symbol.trim().toUpperCase(), symbolItem])
  );
}

function buildHolding(
  position: PositionAccumulator,
  quote: SymbolQuote,
  symbolMeta: PsxSymbol | undefined
): PortfolioHolding {
  const invested = position.units * position.averageBuyPrice;
  const currentPrice = quote.lastPrice;
  const marketValue = position.units * currentPrice;
  const pnl = marketValue - invested;

  const priceDiff = currentPrice - position.averageBuyPrice;
  const priceDiffPct =
    position.averageBuyPrice === 0
      ? 0
      : (priceDiff / position.averageBuyPrice) * 100;
  const pnlPct = invested === 0 ? 0 : (pnl / invested) * 100;

  return {
    symbol: position.symbol,
    companyName: symbolMeta?.name ?? position.symbol,
    sectorName: symbolMeta?.sectorName ?? "UNKNOWN",
    units: position.units,
    averageBuyPrice: position.averageBuyPrice,
    invested,
    currentPrice,
    previousClose: quote.previousClose,
    highPrice: quote.highPrice,
    lowPrice: quote.lowPrice,
    lastVolume: quote.lastVolume,
    asOf: quote.asOf,
    marketValue,
    priceDiff,
    priceDiffPct,
    pnl,
    pnlPct,
    quoteSource: quote.source,
  };
}

async function getPortfolioHoldingsWithQuoteMode(
  quoteMode: QuoteMode
): Promise<PortfolioHolding[]> {
  const savedOrders = await getSavedTradeOrders();
  const positions = buildPositionAccumulators(savedOrders);
  if (positions.length === 0) {
    return [];
  }
  const symbolMetaByCode = await readSymbolsByCode(quoteMode);

  const quotePairs = await Promise.all(
    positions.map(async (position) => {
      const quote = await readQuoteForSymbol(position.symbol, quoteMode);
      return [position, quote] as const;
    })
  );

  return quotePairs
    .map(([position, quote]) =>
      buildHolding(position, quote, symbolMetaByCode.get(position.symbol))
    )
    .sort((firstHolding, secondHolding) =>
      secondHolding.marketValue - firstHolding.marketValue
    );
}

export async function getPortfolioHoldingsWithCachedQuotes(): Promise<PortfolioHolding[]> {
  return getPortfolioHoldingsWithQuoteMode("cache");
}

export async function getPortfolioHoldingsWithLatestQuotes(): Promise<PortfolioHolding[]> {
  return getPortfolioHoldingsWithQuoteMode("latest");
}

export async function getPortfolioHoldingBySymbol(
  symbol: string
): Promise<PortfolioHolding | null> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol.length === 0) {
    return null;
  }

  const latestHoldings = await getPortfolioHoldingsWithLatestQuotes();
  const directMatch = latestHoldings.find(
    (holding) => holding.symbol === normalizedSymbol
  );
  if (directMatch) {
    return directMatch;
  }

  const cachedHoldings = await getPortfolioHoldingsWithCachedQuotes();
  return (
    cachedHoldings.find((holding) => holding.symbol === normalizedSymbol) ?? null
  );
}
