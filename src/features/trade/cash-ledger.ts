import { getSavedDepositRecords } from "@/src/features/deposit/deposit-records";
import { getSavedDividendRecords } from "@/src/features/dividend/dividend-records";
import { calculateBrokerFeeAmount } from "@/src/lib/broker-fee";
import {
  getSavedTradeOrders,
  TradeOrderRecord,
} from "@/src/features/trade/trade-orders";

export type CashLedgerSnapshot = {
  availableCash: number;
  totalDeposits: number;
  totalDividendReturns: number;
  totalBuyOutflow: number;
  totalSellInflow: number;
};

function toNonNegativeFiniteNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function getBrokerFeeAmount(order: TradeOrderRecord): number {
  return calculateBrokerFeeAmount({
    price: order.price,
    units: order.units,
    brokerFeeType: order.brokerFeeType,
    brokerFeeValue: order.brokerFeeValue,
    brokerFeePct: order.brokerFeePct,
    cdcChargePerShare: order.brokerCdcChargePerShare,
  });
}

function getTradeGrossAmount(order: TradeOrderRecord): number {
  return toNonNegativeFiniteNumber(order.price) * toNonNegativeFiniteNumber(order.units);
}

function getTradeCashDelta(order: TradeOrderRecord): number {
  const grossAmount = getTradeGrossAmount(order);
  const brokerFee = getBrokerFeeAmount(order);

  if (order.side === "buy") {
    return -(grossAmount + brokerFee);
  }

  return grossAmount - brokerFee;
}

export async function getCashLedgerSnapshot(options?: {
  excludeTradeId?: string;
}): Promise<CashLedgerSnapshot> {
  const excludeTradeId = options?.excludeTradeId?.trim() ?? "";
  const [deposits, dividends, trades] = await Promise.all([
    getSavedDepositRecords(),
    getSavedDividendRecords(),
    getSavedTradeOrders(),
  ]);

  const effectiveTrades =
    excludeTradeId.length > 0
      ? trades.filter((trade) => trade.id !== excludeTradeId)
      : trades;

  const totalDeposits = deposits.reduce(
    (sum, record) => sum + toNonNegativeFiniteNumber(record.amount),
    0
  );
  const totalDividendReturns = dividends.reduce(
    (sum, record) => sum + toNonNegativeFiniteNumber(record.finalAmount),
    0
  );

  let totalBuyOutflow = 0;
  let totalSellInflow = 0;

  for (const trade of effectiveTrades) {
    const delta = getTradeCashDelta(trade);
    if (delta < 0) {
      totalBuyOutflow += Math.abs(delta);
    } else {
      totalSellInflow += delta;
    }
  }

  const availableCash =
    totalDeposits + totalDividendReturns + totalSellInflow - totalBuyOutflow;

  return {
    availableCash,
    totalDeposits,
    totalDividendReturns,
    totalBuyOutflow,
    totalSellInflow,
  };
}
