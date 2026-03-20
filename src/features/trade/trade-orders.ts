import * as FileSystem from "expo-file-system/legacy";
import { getSavedBonusShareRecords } from "@/src/features/bonus-share/bonus-share-records";
import { getPositionSnapshotForSymbol } from "@/src/features/portfolio/position-ledger";
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
  cashGuardApplied?: boolean;
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
      (typeof order.cashGuardApplied === "boolean" ||
        typeof order.cashGuardApplied === "undefined") &&
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
  const bonusShareRecords = await getSavedBonusShareRecords();
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
    const positionSnapshot = getPositionSnapshotForSymbol(
      store.orders,
      bonusShareRecords,
      normalizedSymbol
    );
    const openUnits = positionSnapshot.units;
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
    cashGuardApplied:
      typeof orderInput.cashGuardApplied === "boolean"
        ? orderInput.cashGuardApplied
        : true,
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

export async function getTradeOrderById(
  orderId: string
): Promise<TradeOrderRecord | null> {
  const normalizedOrderId = orderId.trim();
  if (normalizedOrderId.length === 0) {
    return null;
  }

  const store = await readStore();
  return store.orders.find((order) => order.id === normalizedOrderId) ?? null;
}

export async function updateTradeOrder(
  orderId: string,
  orderInput: TradeOrderInput
): Promise<TradeOrderRecord> {
  const normalizedOrderId = orderId.trim();
  if (normalizedOrderId.length === 0) {
    throw new Error("Invalid trade order id.");
  }

  const store = await readStore();
  const existingOrderIndex = store.orders.findIndex(
    (order) => order.id === normalizedOrderId
  );
  if (existingOrderIndex < 0) {
    throw new Error("Trade order not found.");
  }

  const bonusShareRecords = await getSavedBonusShareRecords();
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
    const ordersWithoutCurrent = store.orders.filter(
      (order) => order.id !== normalizedOrderId
    );
    const positionSnapshot = getPositionSnapshotForSymbol(
      ordersWithoutCurrent,
      bonusShareRecords,
      normalizedSymbol
    );
    const openUnits = positionSnapshot.units;
    if (safeUnits > openUnits) {
      throw new InsufficientUnitsError(normalizedSymbol, openUnits, safeUnits);
    }
  }

  const existingOrder = store.orders[existingOrderIndex];
  const updatedOrder: TradeOrderRecord = {
    id: existingOrder.id,
    createdAt: existingOrder.createdAt,
    side: orderInput.side,
    symbol: normalizedSymbol,
    price: safePrice,
    units: safeUnits,
    tradedAt: orderInput.tradedAt,
    brokerMode: orderInput.brokerMode,
    brokerName: orderInput.brokerName,
    brokerFeePct: orderInput.brokerFeePct,
    cashGuardApplied:
      typeof orderInput.cashGuardApplied === "boolean"
        ? orderInput.cashGuardApplied
        : (existingOrder.cashGuardApplied ?? true),
  };

  const nextOrders = [...store.orders];
  nextOrders[existingOrderIndex] = updatedOrder;

  const nextStore: TradeOrdersStore = {
    version: 1,
    orders: nextOrders,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(nextStore);
  emitTradeMutation({
    type: "trade-created",
    orderId: updatedOrder.id,
    symbol: updatedOrder.symbol,
    side: updatedOrder.side,
    createdAt: new Date().toISOString(),
  });

  return updatedOrder;
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
