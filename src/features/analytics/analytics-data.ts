import { getSavedBonusShareRecords } from "@/src/features/bonus-share/bonus-share-records";
import { getSavedDepositRecords } from "@/src/features/deposit/deposit-records";
import { getSavedDividendRecords } from "@/src/features/dividend/dividend-records";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
  PortfolioHolding,
} from "@/src/features/portfolio/portfolio-data";
import { getSavedTradeOrders, TradeOrderRecord } from "@/src/features/trade/trade-orders";
import {
  getCachedMarketSnapshot,
  getLatestMarketSnapshot,
  MarketIndexSnapshot,
} from "@/src/features/market/market-data";
import { calculateRealizedProfitLoss } from "@/src/features/portfolio/realized-pnl";

export type AnalyticsTrendRange = "1M" | "3M" | "6M" | "1Y" | "ALL";

export type AnalyticsPoint = {
  timestamp: number;
  value: number;
};

export type AnalyticsOverview = {
  currentWorth: number;
  invested: number;
  profit: number;
  realizedProfit: number;
  returnPct: number;
  dayChange: number;
  dayChangePct: number;
  totalDividends: number;
};

export type AnalyticsPerformer = {
  symbol: string;
  name: string;
  returnPct: number;
  weightPct: number;
  impactPkr: number;
  impactPct: number;
};

export type AnalyticsRiskMetrics = {
  maxDrawdownPct: number;
  volatilityPct: number;
  bestDayPct: number;
  bestDayDate: string | null;
  worstDayPct: number;
  worstDayDate: string | null;
};

export type AnalyticsAllocationItem = {
  key: string;
  label: string;
  value: number;
  sharePct: number;
};

export type AnalyticsBenchmark = {
  kse100: MarketIndexSnapshot | null;
  kmi30: MarketIndexSnapshot | null;
};

export type AnalyticsSnapshot = {
  asOf: string | null;
  overview: AnalyticsOverview;
  trend: AnalyticsPoint[];
  risk: AnalyticsRiskMetrics;
  bestPerformer: AnalyticsPerformer | null;
  worstPerformer: AnalyticsPerformer | null;
  companyAllocation: AnalyticsAllocationItem[];
  sectorAllocation: AnalyticsAllocationItem[];
  benchmark: AnalyticsBenchmark;
};

type PositionAccumulator = {
  units: number;
  averagePrice: number;
};

type TimelineEvent =
  | {
      timestamp: number;
      type: "trade";
      order: TradeOrderRecord;
    }
  | {
      timestamp: number;
      type: "deposit";
      amount: number;
    }
  | {
      timestamp: number;
      type: "dividend";
      amount: number;
    }
  | {
      timestamp: number;
      type: "bonus";
      symbol: string;
      units: number;
    };

function getUtcDayStartTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0
  );
}

function getUtcDayDistance(fromTimestamp: number, toTimestamp: number): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const fromDay = getUtcDayStartTimestamp(fromTimestamp);
  const toDay = getUtcDayStartTimestamp(toTimestamp);
  return Math.round((toDay - fromDay) / millisecondsPerDay);
}

function toFiniteNumber(value: number, fallbackValue = 0): number {
  if (!Number.isFinite(value)) {
    return fallbackValue;
  }

  return value;
}

function toNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function toTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return timestamp;
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function buildOverview(args: {
  holdings: PortfolioHolding[];
  totalDividends: number;
  realizedProfit: number;
}): AnalyticsOverview {
  const { holdings, totalDividends, realizedProfit } = args;
  const invested = holdings.reduce((sum, holding) => sum + toNonNegativeNumber(holding.invested), 0);
  const marketValue = holdings.reduce(
    (sum, holding) => sum + toNonNegativeNumber(holding.marketValue),
    0
  );
  const dayChange = holdings.reduce(
    (sum, holding) =>
      sum +
      toNonNegativeNumber(holding.units) *
        (toFiniteNumber(holding.currentPrice) - toFiniteNumber(holding.previousClose)),
    0
  );
  const previousDayValue = marketValue - dayChange;
  const dayChangePct = previousDayValue > 0 ? (dayChange / previousDayValue) * 100 : 0;
  const currentWorth = marketValue;
  const profit = currentWorth - invested;
  const returnPct = invested > 0 ? (profit / invested) * 100 : 0;

  return {
    currentWorth,
    invested,
    profit,
    realizedProfit: toFiniteNumber(realizedProfit),
    returnPct,
    dayChange,
    dayChangePct,
    totalDividends: toNonNegativeNumber(totalDividends),
  };
}

function buildCompanyAllocation(holdings: PortfolioHolding[]): AnalyticsAllocationItem[] {
  const totalValue = holdings.reduce((sum, holding) => sum + toNonNegativeNumber(holding.marketValue), 0);
  if (totalValue <= 0) {
    return [];
  }

  return [...holdings]
    .sort((firstHolding, secondHolding) => secondHolding.marketValue - firstHolding.marketValue)
    .map((holding) => ({
      key: holding.symbol,
      label: holding.symbol,
      value: toNonNegativeNumber(holding.marketValue),
      sharePct:
        totalValue > 0
          ? (toNonNegativeNumber(holding.marketValue) / totalValue) * 100
          : 0,
    }));
}

function buildSectorAllocation(holdings: PortfolioHolding[]): AnalyticsAllocationItem[] {
  const totalValue = holdings.reduce((sum, holding) => sum + toNonNegativeNumber(holding.marketValue), 0);
  if (totalValue <= 0) {
    return [];
  }

  const mapBySector = new Map<string, number>();
  for (const holding of holdings) {
    const sectorName = holding.sectorName?.trim() ? holding.sectorName.trim().toUpperCase() : "UNKNOWN";
    mapBySector.set(
      sectorName,
      (mapBySector.get(sectorName) ?? 0) + toNonNegativeNumber(holding.marketValue)
    );
  }

  return Array.from(mapBySector.entries())
    .map(([sectorName, value]) => ({
      key: sectorName,
      label: sectorName,
      value,
      sharePct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((firstSector, secondSector) => secondSector.value - firstSector.value);
}

function buildPerformers(holdings: PortfolioHolding[]): {
  bestPerformer: AnalyticsPerformer | null;
  worstPerformer: AnalyticsPerformer | null;
} {
  if (holdings.length === 0) {
    return {
      bestPerformer: null,
      worstPerformer: null,
    };
  }

  const totalMarketValue = holdings.reduce(
    (sum, holding) => sum + toNonNegativeNumber(holding.marketValue),
    0
  );
  if (totalMarketValue <= 0) {
    return {
      bestPerformer: null,
      worstPerformer: null,
    };
  }

  const performers = holdings.map((holding) => {
    const marketValue = toNonNegativeNumber(holding.marketValue);
    const pnl = toFiniteNumber(holding.pnl);
    const weightPct = (marketValue / totalMarketValue) * 100;
    const impactPct = (pnl / totalMarketValue) * 100;

    return {
      symbol: holding.symbol,
      name: holding.companyName,
      returnPct: toFiniteNumber(holding.pnlPct),
      weightPct: toFiniteNumber(weightPct),
      impactPkr: pnl,
      impactPct: toFiniteNumber(impactPct),
    };
  });

  const sortedByImpact = [...performers].sort((firstPerformer, secondPerformer) => {
    const byImpact = secondPerformer.impactPkr - firstPerformer.impactPkr;
    if (Math.abs(byImpact) > 1e-8) {
      return byImpact;
    }

    return secondPerformer.returnPct - firstPerformer.returnPct;
  });
  const best = sortedByImpact[0];
  const worst = sortedByImpact[sortedByImpact.length - 1];

  return {
    bestPerformer: best,
    worstPerformer: worst,
  };
}

function buildTimelineEvents(
  trades: TradeOrderRecord[],
  deposits: { amount: number; depositedAt: string }[],
  dividends: { finalAmount: number; dividendDate: string }[],
  bonuses: { symbol: string; units: number; awardedAt: string }[]
): TimelineEvent[] {
  const tradeEvents: TimelineEvent[] = trades.map((order) => ({
    timestamp: toTimestamp(order.tradedAt || order.createdAt),
    type: "trade",
    order,
  }));
  const depositEvents: TimelineEvent[] = deposits.map((record) => ({
    timestamp: toTimestamp(record.depositedAt),
    type: "deposit",
    amount: toNonNegativeNumber(record.amount),
  }));
  const dividendEvents: TimelineEvent[] = dividends.map((record) => ({
    timestamp: toTimestamp(record.dividendDate),
    type: "dividend",
    amount: toNonNegativeNumber(record.finalAmount),
  }));
  const bonusEvents: TimelineEvent[] = bonuses.map((record) => ({
    timestamp: toTimestamp(record.awardedAt),
    type: "bonus",
    symbol: normalizeSymbol(record.symbol),
    units: toNonNegativeNumber(record.units),
  }));

  return [...tradeEvents, ...depositEvents, ...dividendEvents, ...bonusEvents]
    .filter((event) => event.timestamp > 0)
    .sort((firstEvent, secondEvent) => firstEvent.timestamp - secondEvent.timestamp);
}

function updatePositionForBuy(
  current: PositionAccumulator,
  units: number,
  price: number
): PositionAccumulator {
  const normalizedUnits = toNonNegativeNumber(units);
  const normalizedPrice = toNonNegativeNumber(price);
  const currentCost = current.units * current.averagePrice;
  const nextUnits = current.units + normalizedUnits;
  const nextCost = currentCost + normalizedUnits * normalizedPrice;

  return {
    units: nextUnits,
    averagePrice: nextUnits > 0 ? nextCost / nextUnits : 0,
  };
}

function updatePositionForSell(current: PositionAccumulator, units: number): PositionAccumulator {
  const normalizedUnits = toNonNegativeNumber(units);
  const nextUnits = Math.max(0, current.units - normalizedUnits);

  if (nextUnits === 0) {
    return {
      units: 0,
      averagePrice: 0,
    };
  }

  return {
    units: nextUnits,
    averagePrice: current.averagePrice,
  };
}

function updatePositionForBonus(current: PositionAccumulator, units: number): PositionAccumulator {
  const normalizedUnits = toNonNegativeNumber(units);
  const currentCost = current.units * current.averagePrice;
  const nextUnits = current.units + normalizedUnits;

  return {
    units: nextUnits,
    averagePrice: nextUnits > 0 ? currentCost / nextUnits : 0,
  };
}

function getBookValue(positionsBySymbol: Map<string, PositionAccumulator>): number {
  let total = 0;

  for (const [, position] of positionsBySymbol) {
    total += position.units * position.averagePrice;
  }

  return total;
}

function compressDailyPoints(points: AnalyticsPoint[]): AnalyticsPoint[] {
  if (points.length <= 1) {
    return points;
  }

  const pointsByDay = new Map<string, AnalyticsPoint>();
  for (const point of points) {
    const dayKey = new Date(point.timestamp).toISOString().slice(0, 10);
    pointsByDay.set(dayKey, point);
  }

  return Array.from(pointsByDay.values()).sort(
    (firstPoint, secondPoint) => firstPoint.timestamp - secondPoint.timestamp
  );
}

function buildTrendPoints(
  holdings: PortfolioHolding[],
  trades: TradeOrderRecord[],
  deposits: { amount: number; depositedAt: string }[],
  dividends: { finalAmount: number; dividendDate: string }[],
  bonuses: { symbol: string; units: number; awardedAt: string }[],
  analysisAsOfTimestamp: number | null
): AnalyticsPoint[] {
  const timelineEvents = buildTimelineEvents(trades, deposits, dividends, bonuses);
  const positionsBySymbol = new Map<string, PositionAccumulator>();

  for (const holding of holdings) {
    const symbol = normalizeSymbol(holding.symbol);
    const units = toNonNegativeNumber(holding.units);
    const avgPrice = toNonNegativeNumber(holding.averageBuyPrice);
    if (units > 0 && avgPrice > 0) {
      positionsBySymbol.set(symbol, { units, averagePrice: avgPrice });
    }
  }

  const points: AnalyticsPoint[] = [];

  for (const event of timelineEvents) {
    if (event.type === "trade") {
      const symbol = normalizeSymbol(event.order.symbol);
      const current = positionsBySymbol.get(symbol) ?? { units: 0, averagePrice: 0 };

      if (event.order.side === "buy") {
        positionsBySymbol.set(
          symbol,
          updatePositionForBuy(current, event.order.units, event.order.price)
        );
      } else {
        positionsBySymbol.set(symbol, updatePositionForSell(current, event.order.units));
      }
    } else if (event.type === "bonus") {
      const symbol = normalizeSymbol(event.symbol);
      const current = positionsBySymbol.get(symbol) ?? { units: 0, averagePrice: 0 };
      positionsBySymbol.set(symbol, updatePositionForBonus(current, event.units));
    }

    points.push({
      timestamp: event.timestamp,
      value: getBookValue(positionsBySymbol),
    });
  }

  const latestEventTimestamp = timelineEvents[timelineEvents.length - 1]?.timestamp ?? 0;
  const fallbackTimestamp = latestEventTimestamp > 0 ? latestEventTimestamp : Date.now();
  const finalTimestamp =
    analysisAsOfTimestamp && analysisAsOfTimestamp > 0
      ? Math.max(analysisAsOfTimestamp, latestEventTimestamp)
      : fallbackTimestamp;
  const currentMarketValue = holdings.reduce(
    (sum, holding) => sum + toNonNegativeNumber(holding.marketValue),
    0
  );
  points.push({
    timestamp: finalTimestamp,
    value: currentMarketValue,
  });

  const compressed = compressDailyPoints(
    points.sort((firstPoint, secondPoint) => firstPoint.timestamp - secondPoint.timestamp)
  );
  return compressed;
}

function calculateStandardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function buildRiskMetrics(
  points: AnalyticsPoint[]
): AnalyticsRiskMetrics {
  if (points.length < 2) {
    return {
      maxDrawdownPct: 0,
      volatilityPct: 0,
      bestDayPct: 0,
      bestDayDate: null,
      worstDayPct: 0,
      worstDayDate: null,
    };
  }

  const performancePoints = points;

  let runningPeak = performancePoints[0].value;
  let maxDrawdown = 0;
  const dailyReturns: { pct: number; timestamp: number }[] = [];

  for (let index = 1; index < performancePoints.length; index += 1) {
    const previous = performancePoints[index - 1];
    const current = performancePoints[index];
    const previousValue = previous.value;
    const currentValue = current.value;

    if (currentValue > runningPeak) {
      runningPeak = currentValue;
    }

    if (runningPeak > 0) {
      const drawdown = (currentValue - runningPeak) / runningPeak;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    const isConsecutiveDay =
      getUtcDayDistance(previous.timestamp, current.timestamp) === 1;
    if (!isConsecutiveDay || previousValue <= 0) {
      continue;
    }

    const pct = ((currentValue - previousValue) / previousValue) * 100;

    if (Math.abs(pct) > 10) {
      continue;
    }

    dailyReturns.push({
      pct,
      timestamp: current.timestamp,
    });
  }

  if (dailyReturns.length === 0) {
    return {
      maxDrawdownPct: Math.abs(maxDrawdown) * 100,
      volatilityPct: 0,
      bestDayPct: 0,
      bestDayDate: null,
      worstDayPct: 0,
      worstDayDate: null,
    };
  }

  const positiveReturns = dailyReturns.filter((entry) => entry.pct > 0);
  const negativeReturns = dailyReturns.filter((entry) => entry.pct < 0);
  const bestDay =
    positiveReturns.length > 0
      ? positiveReturns.reduce((best, current) =>
          current.pct > best.pct ? current : best
        )
      : null;
  const worstDay =
    negativeReturns.length > 0
      ? negativeReturns.reduce((worst, current) =>
          current.pct < worst.pct ? current : worst
        )
      : null;

  return {
    maxDrawdownPct: Math.abs(maxDrawdown) * 100,
    volatilityPct: calculateStandardDeviation(dailyReturns.map((entry) => entry.pct)),
    bestDayPct: bestDay?.pct ?? 0,
    bestDayDate: bestDay ? new Date(bestDay.timestamp).toISOString() : null,
    worstDayPct: worstDay?.pct ?? 0,
    worstDayDate: worstDay ? new Date(worstDay.timestamp).toISOString() : null,
  };
}

function buildBenchmark(indices: MarketIndexSnapshot[]): AnalyticsBenchmark {
  const kse100 = indices.find((indexItem) => indexItem.code === "KSE100") ?? null;
  const kmi30 = indices.find((indexItem) => indexItem.code === "KMI30") ?? null;

  return {
    kse100,
    kmi30,
  };
}

function getLatestAnalysisAsOfTimestamp(
  holdings: PortfolioHolding[],
  benchmark: AnalyticsBenchmark
): number | null {
  const candidateTimestamps: number[] = [];

  for (const holding of holdings) {
    if (!holding.asOf) {
      continue;
    }

    const timestamp = toTimestamp(holding.asOf);
    if (timestamp > 0) {
      candidateTimestamps.push(timestamp);
    }
  }

  const benchmarkAsOfValues = [benchmark.kse100?.asOf, benchmark.kmi30?.asOf];
  for (const asOfValue of benchmarkAsOfValues) {
    if (!asOfValue) {
      continue;
    }

    const timestamp = toTimestamp(asOfValue);
    if (timestamp > 0) {
      candidateTimestamps.push(timestamp);
    }
  }

  if (candidateTimestamps.length === 0) {
    return null;
  }

  return Math.max(...candidateTimestamps);
}

function buildSnapshot(args: {
  holdings: PortfolioHolding[];
  trades: TradeOrderRecord[];
  deposits: { amount: number; depositedAt: string }[];
  dividends: { finalAmount: number; dividendDate: string }[];
  bonuses: { symbol: string; units: number; awardedAt: string }[];
  totalDividends: number;
  realizedProfit: number;
  indices: MarketIndexSnapshot[];
}): AnalyticsSnapshot {
  const overview = buildOverview({
    holdings: args.holdings,
    totalDividends: args.totalDividends,
    realizedProfit: args.realizedProfit,
  });
  const benchmark = buildBenchmark(args.indices);
  const benchmarkAsOf = benchmark.kse100?.asOf ?? benchmark.kmi30?.asOf ?? null;
  const analysisAsOfTimestamp = getLatestAnalysisAsOfTimestamp(args.holdings, benchmark);
  const trend = buildTrendPoints(
    args.holdings,
    args.trades,
    args.deposits,
    args.dividends,
    args.bonuses,
    analysisAsOfTimestamp
  );
  const risk = buildRiskMetrics(trend);
  const performers = buildPerformers(args.holdings);
  const companyAllocation = buildCompanyAllocation(args.holdings);
  const sectorAllocation = buildSectorAllocation(args.holdings);

  return {
    asOf: benchmarkAsOf,
    overview,
    trend,
    risk,
    bestPerformer: performers.bestPerformer,
    worstPerformer: performers.worstPerformer,
    companyAllocation,
    sectorAllocation,
    benchmark,
  };
}

async function fetchSnapshotData(mode: "cache" | "latest"): Promise<AnalyticsSnapshot> {
  const [
    holdings,
    trades,
    deposits,
    dividends,
    bonuses,
    indices,
  ] = await Promise.all([
    mode === "latest"
      ? getPortfolioHoldingsWithLatestQuotes()
      : getPortfolioHoldingsWithCachedQuotes(),
    getSavedTradeOrders(),
    getSavedDepositRecords(),
    getSavedDividendRecords(),
    getSavedBonusShareRecords(),
    mode === "latest" ? getLatestMarketSnapshot() : getCachedMarketSnapshot(),
  ]);

  const totalDividends = dividends.reduce(
    (sum, record) => sum + toNonNegativeNumber(record.finalAmount),
    0
  );
  const realizedProfit = calculateRealizedProfitLoss(trades, bonuses);

  return buildSnapshot({
    holdings,
    trades,
    deposits,
    dividends,
    bonuses,
    totalDividends,
    realizedProfit,
    indices,
  });
}

export function getAnalyticsRangeStartTimestamp(range: AnalyticsTrendRange): number | null {
  if (range === "ALL") {
    return null;
  }

  const now = new Date();
  const nextDate = new Date(now);

  if (range === "1M") {
    nextDate.setMonth(nextDate.getMonth() - 1);
  } else if (range === "3M") {
    nextDate.setMonth(nextDate.getMonth() - 3);
  } else if (range === "6M") {
    nextDate.setMonth(nextDate.getMonth() - 6);
  } else {
    nextDate.setFullYear(nextDate.getFullYear() - 1);
  }

  return nextDate.getTime();
}

export function getTrendPointsForRange(
  points: AnalyticsPoint[],
  range: AnalyticsTrendRange
): AnalyticsPoint[] {
  const startTimestamp = getAnalyticsRangeStartTimestamp(range);
  if (startTimestamp === null) {
    return points;
  }

  return points.filter((point) => point.timestamp >= startTimestamp);
}

export async function getCachedAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  return fetchSnapshotData("cache");
}

export async function getLatestAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  try {
    return await fetchSnapshotData("latest");
  } catch {
    return getCachedAnalyticsSnapshot();
  }
}
