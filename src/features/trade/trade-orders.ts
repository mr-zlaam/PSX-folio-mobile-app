import * as FileSystem from "expo-file-system/legacy";
import { getSavedBonusShareRecords } from "@/src/features/bonus-share/bonus-share-records";
import { getPositionSnapshotForSymbol } from "@/src/features/portfolio/position-ledger";
import {
  BrokerFeeType,
  DEFAULT_BROKER_COMMISSION_PCT,
  normalizeBrokerFeeType,
  resolveBrokerFeeValue,
} from "@/src/lib/broker-fee";
import {
  emitTradeDeletedMutation,
  emitTradeMutation,
} from "@/src/features/trade/trade-events";

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
  brokerFeeType: BrokerFeeType;
  brokerFeeValue: number | null;
  brokerCdcChargePerShare?: number | null;
  brokerDeductionEnabled?: boolean;
};

export type TradeOrderRecord = TradeOrderInput & {
  id: string;
  createdAt: string;
  // Legacy compatibility for old backups/records.
  brokerFeePct?: number | null;
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

function resolveBrokerFeeValueWithDefault(input: {
  brokerFeeValue?: number | null;
  brokerFeePct?: number | null;
}): number {
  const hasExplicitFeeValue =
    typeof input.brokerFeeValue === "number" &&
    Number.isFinite(input.brokerFeeValue);
  const hasExplicitFeePct =
    typeof input.brokerFeePct === "number" && Number.isFinite(input.brokerFeePct);

  if (hasExplicitFeeValue || hasExplicitFeePct) {
    return resolveBrokerFeeValue(input);
  }

  return DEFAULT_BROKER_COMMISSION_PCT;
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
  const validOrders = rawOrders
    .filter(
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
      (typeof order.brokerFeeType === "string" ||
        typeof order.brokerFeeType === "undefined") &&
      (typeof order.brokerFeeValue === "number" ||
        order.brokerFeeValue === null ||
        typeof order.brokerFeeValue === "undefined") &&
      (typeof order.brokerCdcChargePerShare === "number" ||
        order.brokerCdcChargePerShare === null ||
        typeof order.brokerCdcChargePerShare === "undefined") &&
      (typeof order.brokerDeductionEnabled === "boolean" ||
        typeof order.brokerDeductionEnabled === "undefined") &&
      (typeof order.brokerFeePct === "number" ||
        order.brokerFeePct === null ||
        typeof order.brokerFeePct === "undefined") &&
      typeof order.createdAt === "string"
    )
    .map((order) => {
      const normalizedBrokerFeeType = normalizeBrokerFeeType(
        typeof order.brokerFeeType === "string" ? order.brokerFeeType : null
      );
      const normalizedBrokerFeeValue = resolveBrokerFeeValueWithDefault({
        brokerFeeValue:
          typeof order.brokerFeeValue === "number" &&
          Number.isFinite(order.brokerFeeValue)
            ? order.brokerFeeValue
            : null,
        brokerFeePct:
          typeof order.brokerFeePct === "number" && Number.isFinite(order.brokerFeePct)
            ? order.brokerFeePct
            : null,
      });
      const normalizedBrokerCdcChargePerShare =
        typeof order.brokerCdcChargePerShare === "number" &&
        Number.isFinite(order.brokerCdcChargePerShare) &&
        order.brokerCdcChargePerShare >= 0
          ? order.brokerCdcChargePerShare
          : null;
      const normalizedBrokerDeductionEnabled =
        typeof order.brokerDeductionEnabled === "boolean"
          ? order.brokerDeductionEnabled
          : normalizedBrokerFeeValue > 0 ||
              (normalizedBrokerCdcChargePerShare ?? 0) > 0;

      return {
        id: order.id,
        side: order.side,
        symbol: order.symbol.trim().toUpperCase(),
        price: order.price,
        units: order.units,
        tradedAt: order.tradedAt,
        brokerMode: order.brokerMode,
        brokerName: order.brokerName,
        brokerFeeType: normalizedBrokerFeeType,
        brokerFeeValue: normalizedBrokerFeeValue,
        brokerCdcChargePerShare: normalizedBrokerCdcChargePerShare,
        brokerDeductionEnabled: normalizedBrokerDeductionEnabled,
        createdAt: order.createdAt,
      };
    });

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
    brokerFeeType: normalizeBrokerFeeType(orderInput.brokerFeeType),
    brokerFeeValue: resolveBrokerFeeValueWithDefault({
      brokerFeeValue: orderInput.brokerFeeValue,
    }),
    brokerCdcChargePerShare:
      typeof orderInput.brokerCdcChargePerShare === "number" &&
      Number.isFinite(orderInput.brokerCdcChargePerShare) &&
      orderInput.brokerCdcChargePerShare >= 0
        ? orderInput.brokerCdcChargePerShare
        : null,
    brokerDeductionEnabled:
      typeof orderInput.brokerDeductionEnabled === "boolean"
        ? orderInput.brokerDeductionEnabled
        : resolveBrokerFeeValueWithDefault({
              brokerFeeValue: orderInput.brokerFeeValue,
            }) > 0 ||
            (typeof orderInput.brokerCdcChargePerShare === "number" &&
              Number.isFinite(orderInput.brokerCdcChargePerShare) &&
              orderInput.brokerCdcChargePerShare > 0),
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
    brokerFeeType: normalizeBrokerFeeType(orderInput.brokerFeeType),
    brokerFeeValue: resolveBrokerFeeValueWithDefault({
      brokerFeeValue: orderInput.brokerFeeValue,
    }),
    brokerCdcChargePerShare:
      typeof orderInput.brokerCdcChargePerShare === "number" &&
      Number.isFinite(orderInput.brokerCdcChargePerShare) &&
      orderInput.brokerCdcChargePerShare >= 0
        ? orderInput.brokerCdcChargePerShare
        : null,
    brokerDeductionEnabled:
      typeof orderInput.brokerDeductionEnabled === "boolean"
        ? orderInput.brokerDeductionEnabled
        : resolveBrokerFeeValueWithDefault({
              brokerFeeValue: orderInput.brokerFeeValue,
            }) > 0 ||
            (typeof orderInput.brokerCdcChargePerShare === "number" &&
              Number.isFinite(orderInput.brokerCdcChargePerShare) &&
              orderInput.brokerCdcChargePerShare > 0),
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

export async function deleteTradeOrder(orderId: string): Promise<TradeOrderRecord> {
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

  const deletedOrder = store.orders[existingOrderIndex];
  const nextOrders = store.orders.filter((order) => order.id !== normalizedOrderId);
  const nextStore: TradeOrdersStore = {
    version: 1,
    orders: nextOrders,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(nextStore);
  emitTradeDeletedMutation({
    orderId: deletedOrder.id,
    symbol: deletedOrder.symbol,
    side: deletedOrder.side,
    createdAt: new Date().toISOString(),
  });

  return deletedOrder;
}

export async function clearSavedTradeOrders(): Promise<void> {
  const clearedStore: TradeOrdersStore = {
    version: 1,
    orders: [],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(clearedStore);
}

export async function replaceSavedTradeOrders(
  orders: TradeOrderRecord[]
): Promise<void> {
  const normalizedStore = getSafeOrdersStore({
    version: 1,
    orders,
    updatedAt: new Date().toISOString(),
  });

  await writeStore(normalizedStore);
}
