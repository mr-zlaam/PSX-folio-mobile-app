import * as FileSystem from "expo-file-system/legacy";
import { emitTradeMutation } from "@/src/features/trade/trade-events";

export type TradeSide = "buy" | "sell";
export type BrokerMode = "saved" | "custom";

export type TradeOrderInput = {
  side: TradeSide;
  symbol: string;
  price: number;
  units: number;
  tradedAt: string;
  brokerMode: BrokerMode;
  brokerName: string | null;
  brokerFeePct: number | null;
};

export type TradeOrderRecord = TradeOrderInput & {
  id: string;
  createdAt: string;
};

type TradeOrdersStore = {
  version: 1;
  orders: TradeOrderRecord[];
  updatedAt: string;
};

export class InsufficientUnitsError extends Error {
  readonly symbol: string;
  readonly availableUnits: number;
  readonly requestedUnits: number;

  constructor(symbol: string, availableUnits: number, requestedUnits: number) {
    super(`Cannot sell ${requestedUnits} units of ${symbol}. Available units: ${availableUnits}.`);
    this.name = "InsufficientUnitsError";
    this.symbol = symbol;
    this.availableUnits = availableUnits;
    this.requestedUnits = requestedUnits;
  }
}

const TRADE_ORDERS_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-trade-orders.json`
  : null;

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

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

function toSafeUnits(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function getOpenUnitsForSymbol(
  orders: TradeOrderRecord[],
  symbol: string
): number {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (normalizedSymbol.length === 0) {
    return 0;
  }

  let openUnits = 0;
  const sortedOrders = sortOrdersChronologically(orders);
  for (const order of sortedOrders) {
    if (normalizeSymbol(order.symbol) !== normalizedSymbol) {
      continue;
    }

    const safeUnits = toSafeUnits(order.units);
    if (safeUnits === 0) {
      continue;
    }

    if (order.side === "buy") {
      openUnits += safeUnits;
      continue;
    }

    const sellableUnits = Math.min(openUnits, safeUnits);
    openUnits -= sellableUnits;
  }

  return openUnits;
}

function getSafeOrdersStore(value: unknown): TradeOrdersStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      version: 1,
      orders: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const rawStore = value as Partial<TradeOrdersStore>;
  const rawOrders = Array.isArray(rawStore.orders) ? rawStore.orders : [];
  const validOrders = rawOrders.filter(
    (order): order is TradeOrderRecord =>
      Boolean(order) &&
      typeof order.id === "string" &&
      (order.side === "buy" || order.side === "sell") &&
      typeof order.symbol === "string" &&
      typeof order.price === "number" &&
      Number.isFinite(order.price) &&
      typeof order.units === "number" &&
      Number.isFinite(order.units) &&
      typeof order.tradedAt === "string" &&
      (order.brokerMode === "saved" || order.brokerMode === "custom") &&
      (typeof order.brokerName === "string" || order.brokerName === null) &&
      (typeof order.brokerFeePct === "number" ||
        order.brokerFeePct === null) &&
      typeof order.createdAt === "string"
  );

  return {
    version: 1,
    orders: validOrders,
    updatedAt:
      typeof rawStore.updatedAt === "string"
        ? rawStore.updatedAt
        : new Date().toISOString(),
  };
}

async function readStore(): Promise<TradeOrdersStore> {
  if (!TRADE_ORDERS_FILE_URI) {
    return {
      version: 1,
      orders: [],
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const rawValue = await FileSystem.readAsStringAsync(TRADE_ORDERS_FILE_URI);
    const parsedValue = JSON.parse(rawValue);
    return getSafeOrdersStore(parsedValue);
  } catch {
    return {
      version: 1,
      orders: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeStore(store: TradeOrdersStore): Promise<void> {
  if (!TRADE_ORDERS_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(TRADE_ORDERS_FILE_URI, JSON.stringify(store));
}

function buildTradeOrderId(): string {
  return `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveTradeOrder(
  orderInput: TradeOrderInput
): Promise<TradeOrderRecord> {
  const store = await readStore();
  const normalizedSymbol = normalizeSymbol(orderInput.symbol);
  const safePrice = orderInput.price;
  const safeUnits = orderInput.units;

  if (
    normalizedSymbol.length === 0 ||
    !Number.isFinite(safePrice) ||
    safePrice <= 0 ||
    !Number.isFinite(safeUnits) ||
    safeUnits <= 0 ||
    !Number.isInteger(safeUnits)
  ) {
    throw new Error("Invalid trade order input.");
  }

  if (orderInput.side === "sell") {
    const openUnits = getOpenUnitsForSymbol(store.orders, normalizedSymbol);
    if (safeUnits > openUnits) {
      throw new InsufficientUnitsError(normalizedSymbol, openUnits, safeUnits);
    }
  }

  const record: TradeOrderRecord = {
    id: buildTradeOrderId(),
    side: orderInput.side,
    symbol: normalizedSymbol,
    price: safePrice,
    units: safeUnits,
    tradedAt: orderInput.tradedAt,
    brokerMode: orderInput.brokerMode,
    brokerName: orderInput.brokerName,
    brokerFeePct: orderInput.brokerFeePct,
    createdAt: new Date().toISOString(),
  };

  const nextStore: TradeOrdersStore = {
    version: 1,
    orders: [record, ...store.orders],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(nextStore);
  emitTradeMutation({
    type: "trade-created",
    orderId: record.id,
    symbol: record.symbol,
    side: record.side,
    createdAt: record.createdAt,
  });
  return record;
}

export async function getSavedTradeOrders(): Promise<TradeOrderRecord[]> {
  const store = await readStore();
  return store.orders;
}

export async function clearSavedTradeOrders(): Promise<void> {
  const clearedStore: TradeOrdersStore = {
    version: 1,
    orders: [],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(clearedStore);
}
