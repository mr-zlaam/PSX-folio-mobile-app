export type BrokerFeeType = "percentage" | "fixed";

type BrokerFeeInput = {
  price: number;
  units: number;
  brokerFeeType?: BrokerFeeType | null;
  brokerFeeValue?: number | null;
  brokerFeePct?: number | null;
  sstRatePct?: number | null;
  cdcChargePerShare?: number | null;
};

export type BrokerDeductionBreakdown = {
  brokerCommissionAmount: number;
  sstAmount: number;
  cdcAmount: number;
  totalAmount: number;
};

export const DEFAULT_BROKER_COMMISSION_PCT = 0.15;
export const DEFAULT_SST_RATE_PCT = 15;
export const DEFAULT_CDC_CHARGE_PER_SHARE = 0.005;

function toNonNegativeFiniteNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

export function normalizeBrokerFeeType(
  value: BrokerFeeType | string | null | undefined
): BrokerFeeType {
  return value === "fixed" ? "fixed" : "percentage";
}

export function resolveBrokerFeeValue(input: {
  brokerFeeValue?: number | null;
  brokerFeePct?: number | null;
}): number {
  if (typeof input.brokerFeeValue === "number" && Number.isFinite(input.brokerFeeValue)) {
    return toNonNegativeFiniteNumber(input.brokerFeeValue);
  }

  return toNonNegativeFiniteNumber(input.brokerFeePct ?? 0);
}

export function calculateBrokerFeeAmount(input: BrokerFeeInput): number {
  return calculateBrokerDeductionBreakdown(input).totalAmount;
}

export function calculateBrokerDeductionBreakdown(
  input: BrokerFeeInput
): BrokerDeductionBreakdown {
  const grossAmount =
    toNonNegativeFiniteNumber(input.price) * toNonNegativeFiniteNumber(input.units);
  const safeUnits = toNonNegativeFiniteNumber(input.units);
  const brokerFeeType = normalizeBrokerFeeType(input.brokerFeeType);
  const brokerFeeValue = resolveBrokerFeeValue({
    brokerFeeValue: input.brokerFeeValue,
    brokerFeePct: input.brokerFeePct,
  });

  let brokerCommissionAmount = 0;

  if (brokerFeeType === "fixed") {
    brokerCommissionAmount = brokerFeeValue;
  } else if (brokerFeeValue !== 0 && grossAmount !== 0) {
    brokerCommissionAmount = (grossAmount * brokerFeeValue) / 100;
  }

  if (safeUnits <= 0) {
    return {
      brokerCommissionAmount: 0,
      sstAmount: 0,
      cdcAmount: 0,
      totalAmount: 0,
    };
  }

  const safeSstRatePct = toNonNegativeFiniteNumber(
    input.sstRatePct ?? DEFAULT_SST_RATE_PCT
  );
  const safeCdcChargePerShare = toNonNegativeFiniteNumber(
    input.cdcChargePerShare ?? DEFAULT_CDC_CHARGE_PER_SHARE
  );

  const normalizedCommissionAmount =
    brokerCommissionAmount > 0 ? brokerCommissionAmount : 0;
  const sstAmount = (normalizedCommissionAmount * safeSstRatePct) / 100;
  const cdcAmount = safeUnits * safeCdcChargePerShare;
  const totalAmount = normalizedCommissionAmount + sstAmount + cdcAmount;

  return {
    brokerCommissionAmount: normalizedCommissionAmount,
    sstAmount,
    cdcAmount,
    totalAmount,
  };
}

export function formatBrokerFeeValueLabel(input: {
  brokerFeeType: BrokerFeeType;
  brokerFeeValue: number;
}): string {
  if (input.brokerFeeType === "fixed") {
    return `PKR ${input.brokerFeeValue}`;
  }

  return `${input.brokerFeeValue}%`;
}
