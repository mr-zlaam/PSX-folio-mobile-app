import { BonusShareRecord } from "@/src/features/bonus-share/bonus-share-records";
import { TradeOrderRecord } from "@/src/features/trade/trade-orders";

type PositionAccumulator = {
  symbol: string;
  units: number;
  averageBuyPrice: number;
};

type PositionEvent =
  | {
      type: "buy" | "sell";
      symbol: string;
      units: number;
      price: number;
      occurredAt: string;
      createdAt: string;
    }
  | {
      type: "bonus";
      symbol: string;
      units: number;
      occurredAt: string;
      createdAt: string;
    };

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function toPositiveFiniteNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function toPositionEventFromTradeOrder(order: TradeOrderRecord): PositionEvent | null {
  const normalizedSymbol = normalizeSymbol(order.symbol);
  const units = toPositiveFiniteNumber(order.units);
  const price = toPositiveFiniteNumber(order.price);
  if (normalizedSymbol.length === 0 || units === 0 || price === 0) {
    return null;
  }

  return {
    type: order.side,
    symbol: normalizedSymbol,
    units,
    price,
    occurredAt: order.tradedAt,
    createdAt: order.createdAt,
  };
}

function toPositionEventFromBonusRecord(record: BonusShareRecord): PositionEvent | null {
  const normalizedSymbol = normalizeSymbol(record.symbol);
  const units = toPositiveFiniteNumber(record.units);
  if (normalizedSymbol.length === 0 || units === 0) {
    return null;
  }

  return {
    type: "bonus",
    symbol: normalizedSymbol,
    units,
    occurredAt: record.awardedAt,
    createdAt: record.createdAt,
  };
}

function toEventTimestamp(event: PositionEvent): number {
  const timestamp = new Date(event.occurredAt).getTime();
  if (Number.isFinite(timestamp)) {
    return timestamp;
  }

  const createdAtTimestamp = new Date(event.createdAt).getTime();
  return Number.isFinite(createdAtTimestamp) ? createdAtTimestamp : 0;
}

function sortEventsChronologically(events: PositionEvent[]): PositionEvent[] {
  return [...events].sort((firstEvent, secondEvent) => {
    const firstTimestamp = toEventTimestamp(firstEvent);
    const secondTimestamp = toEventTimestamp(secondEvent);
    if (firstTimestamp !== secondTimestamp) {
      return firstTimestamp - secondTimestamp;
    }

    return firstEvent.createdAt.localeCompare(secondEvent.createdAt);
  });
}

function applyBuy(
  accumulator: PositionAccumulator,
  units: number,
  unitPrice: number
): void {
  const currentCost = accumulator.units * accumulator.averageBuyPrice;
  const nextUnits = accumulator.units + units;
  const nextCost = currentCost + units * unitPrice;

  accumulator.units = nextUnits;
  accumulator.averageBuyPrice = nextUnits > 0 ? nextCost / nextUnits : 0;
}

function applyBonus(accumulator: PositionAccumulator, units: number): void {
  const currentCost = accumulator.units * accumulator.averageBuyPrice;
  const nextUnits = accumulator.units + units;
  accumulator.units = nextUnits;
  accumulator.averageBuyPrice = nextUnits > 0 ? currentCost / nextUnits : 0;
}

function applySell(accumulator: PositionAccumulator, units: number): void {
  const sellableUnits = Math.min(accumulator.units, units);
  accumulator.units -= sellableUnits;

  if (accumulator.units <= 0) {
    accumulator.units = 0;
    accumulator.averageBuyPrice = 0;
  }
}

function buildPositionMap(
  tradeOrders: TradeOrderRecord[],
  bonusShareRecords: BonusShareRecord[],
  options?: {
    beforeTimestamp?: number | null;
  }
): Map<string, PositionAccumulator> {
  const beforeTimestamp =
    typeof options?.beforeTimestamp === "number" &&
    Number.isFinite(options.beforeTimestamp)
      ? options.beforeTimestamp
      : null;
  const events = [
    ...tradeOrders
      .map((order) => toPositionEventFromTradeOrder(order))
      .filter((event): event is PositionEvent => event !== null),
    ...bonusShareRecords
      .map((record) => toPositionEventFromBonusRecord(record))
      .filter((event): event is PositionEvent => event !== null),
  ];

  const sortedEvents = sortEventsChronologically(events);
  const bySymbol = new Map<string, PositionAccumulator>();

  for (const event of sortedEvents) {
    if (beforeTimestamp !== null) {
      const eventTimestamp = toEventTimestamp(event);
      if (eventTimestamp >= beforeTimestamp) {
        continue;
      }
    }

    const currentAccumulator = bySymbol.get(event.symbol) ?? {
      symbol: event.symbol,
      units: 0,
      averageBuyPrice: 0,
    };

    if (event.type === "buy") {
      applyBuy(currentAccumulator, event.units, event.price);
    } else if (event.type === "bonus") {
      applyBonus(currentAccumulator, event.units);
    } else {
      applySell(currentAccumulator, event.units);
    }

    bySymbol.set(event.symbol, currentAccumulator);
  }

  return bySymbol;
}

export function getPositionSnapshotForSymbol(
  tradeOrders: TradeOrderRecord[],
  bonusShareRecords: BonusShareRecord[],
  symbol: string
): PositionAccumulator {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (normalizedSymbol.length === 0) {
    return {
      symbol: "",
      units: 0,
      averageBuyPrice: 0,
    };
  }

  const positionMap = buildPositionMap(tradeOrders, bonusShareRecords);
  return (
    positionMap.get(normalizedSymbol) ?? {
      symbol: normalizedSymbol,
      units: 0,
      averageBuyPrice: 0,
    }
  );
}

export function getAllPositionSnapshots(
  tradeOrders: TradeOrderRecord[],
  bonusShareRecords: BonusShareRecord[]
): PositionAccumulator[] {
  const positionMap = buildPositionMap(tradeOrders, bonusShareRecords);
  return Array.from(positionMap.values()).filter((position) => position.units > 0);
}

export function getPositionSnapshotForSymbolBeforeDate(
  tradeOrders: TradeOrderRecord[],
  bonusShareRecords: BonusShareRecord[],
  symbol: string,
  beforeDateIso: string
): PositionAccumulator {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (normalizedSymbol.length === 0) {
    return {
      symbol: "",
      units: 0,
      averageBuyPrice: 0,
    };
  }

  const beforeTimestamp = new Date(beforeDateIso).getTime();
  if (!Number.isFinite(beforeTimestamp)) {
    return {
      symbol: normalizedSymbol,
      units: 0,
      averageBuyPrice: 0,
    };
  }

  const positionMap = buildPositionMap(tradeOrders, bonusShareRecords, {
    beforeTimestamp,
  });
  return (
    positionMap.get(normalizedSymbol) ?? {
      symbol: normalizedSymbol,
      units: 0,
      averageBuyPrice: 0,
    }
  );
}
