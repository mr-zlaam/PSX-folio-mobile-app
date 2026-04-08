import { BonusShareRecord } from "@/src/features/bonus-share/bonus-share-records";
import { TradeOrderRecord } from "@/src/features/trade/trade-orders";
import { calculateBrokerFeeAmount } from "@/src/lib/broker-fee";

type PositionAccumulator = {
  units: number;
  totalCost: number;
};

type PositionEvent =
  | {
      type: "trade";
      trade: TradeOrderRecord;
      symbol: string;
      occurredAt: string;
      createdAt: string;
      sortId: string;
    }
  | {
      type: "bonus";
      symbol: string;
      units: number;
      occurredAt: string;
      createdAt: string;
      sortId: string;
    };

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function toPositiveFiniteNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function toTimestamp(occurredAt: string, createdAt: string): number {
  const occurredAtTimestamp = new Date(occurredAt).getTime();
  if (Number.isFinite(occurredAtTimestamp)) {
    return occurredAtTimestamp;
  }

  const createdAtTimestamp = new Date(createdAt).getTime();
  return Number.isFinite(createdAtTimestamp) ? createdAtTimestamp : 0;
}

function buildPositionEvents(
  tradeOrders: TradeOrderRecord[],
  bonusShareRecords: BonusShareRecord[],
): PositionEvent[] {
  const tradeEvents = tradeOrders
    .map((tradeOrder) => {
      const symbol = normalizeSymbol(tradeOrder.symbol);
      const units = toPositiveFiniteNumber(tradeOrder.units);
      const price = toPositiveFiniteNumber(tradeOrder.price);
      if (symbol.length === 0 || units === 0 || price === 0) {
        return null;
      }

      return {
        type: "trade",
        trade: tradeOrder,
        symbol,
        occurredAt: tradeOrder.tradedAt,
        createdAt: tradeOrder.createdAt,
        sortId: tradeOrder.id,
      } satisfies PositionEvent;
    })
    .filter(isNonNull);

  const bonusEvents = bonusShareRecords
    .map((bonusRecord) => {
      const symbol = normalizeSymbol(bonusRecord.symbol);
      const units = toPositiveFiniteNumber(bonusRecord.units);
      if (symbol.length === 0 || units === 0) {
        return null;
      }

      return {
        type: "bonus",
        symbol,
        units,
        occurredAt: bonusRecord.awardedAt,
        createdAt: bonusRecord.createdAt,
        sortId: bonusRecord.id,
      } satisfies PositionEvent;
    })
    .filter(isNonNull);

  return [...tradeEvents, ...bonusEvents].sort((firstEvent, secondEvent) => {
    const firstTimestamp = toTimestamp(firstEvent.occurredAt, firstEvent.createdAt);
    const secondTimestamp = toTimestamp(secondEvent.occurredAt, secondEvent.createdAt);
    if (firstTimestamp !== secondTimestamp) {
      return firstTimestamp - secondTimestamp;
    }

    if (firstEvent.createdAt !== secondEvent.createdAt) {
      return firstEvent.createdAt.localeCompare(secondEvent.createdAt);
    }

    return firstEvent.sortId.localeCompare(secondEvent.sortId);
  });
}

function getBrokerFeeForExecutedUnits(
  tradeOrder: TradeOrderRecord,
  executedUnits: number,
): number {
  if (tradeOrder.brokerDeductionEnabled === false) {
    return 0;
  }

  const safeOrderUnits = toPositiveFiniteNumber(tradeOrder.units);
  const safeExecutedUnits = toPositiveFiniteNumber(executedUnits);
  if (safeOrderUnits === 0 || safeExecutedUnits === 0) {
    return 0;
  }

  const fullOrderFee = calculateBrokerFeeAmount({
    price: tradeOrder.price,
    units: safeOrderUnits,
    brokerFeeType: tradeOrder.brokerFeeType,
    brokerFeeValue: tradeOrder.brokerFeeValue,
    brokerFeePct: tradeOrder.brokerFeePct,
    cdcChargePerShare: tradeOrder.brokerCdcChargePerShare,
  });

  if (safeExecutedUnits >= safeOrderUnits) {
    return fullOrderFee;
  }

  return fullOrderFee * (safeExecutedUnits / safeOrderUnits);
}

export function calculateRealizedProfitLoss(
  tradeOrders: TradeOrderRecord[],
  bonusShareRecords: BonusShareRecord[],
): number {
  const events = buildPositionEvents(tradeOrders, bonusShareRecords);
  const positionsBySymbol = new Map<string, PositionAccumulator>();
  let realizedProfitLoss = 0;

  for (const event of events) {
    const currentPosition = positionsBySymbol.get(event.symbol) ?? {
      units: 0,
      totalCost: 0,
    };

    if (event.type === "bonus") {
      currentPosition.units += event.units;
      positionsBySymbol.set(event.symbol, currentPosition);
      continue;
    }

    const tradeOrder = event.trade;
    const units = toPositiveFiniteNumber(tradeOrder.units);
    const price = toPositiveFiniteNumber(tradeOrder.price);
    if (units === 0 || price === 0) {
      continue;
    }

    if (tradeOrder.side === "buy") {
      const buyCost = units * price;
      const buyFee = getBrokerFeeForExecutedUnits(tradeOrder, units);
      currentPosition.units += units;
      currentPosition.totalCost += buyCost + buyFee;
      positionsBySymbol.set(event.symbol, currentPosition);
      continue;
    }

    const sellUnits = Math.min(units, currentPosition.units);
    if (sellUnits <= 0) {
      continue;
    }

    const averageCostPerUnit =
      currentPosition.units > 0 ? currentPosition.totalCost / currentPosition.units : 0;
    const realizedCost = averageCostPerUnit * sellUnits;
    const grossProceeds = sellUnits * price;
    const sellFee = getBrokerFeeForExecutedUnits(tradeOrder, sellUnits);
    realizedProfitLoss += grossProceeds - sellFee - realizedCost;

    currentPosition.units -= sellUnits;
    currentPosition.totalCost = Math.max(0, currentPosition.totalCost - realizedCost);
    if (currentPosition.units <= 0) {
      currentPosition.units = 0;
      currentPosition.totalCost = 0;
    }

    positionsBySymbol.set(event.symbol, currentPosition);
  }

  return Number.isFinite(realizedProfitLoss) ? realizedProfitLoss : 0;
}
