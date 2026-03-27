export type BrokerFeeType = "percentage" | "fixed";

type BrokerFeeInput = {
  price: number;
  units: number;
  brokerFeeType?: BrokerFeeType | null;
  brokerFeeValue?: number | null;
  brokerFeePct?: number | null;
};

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
  const grossAmount =
    toNonNegativeFiniteNumber(input.price) * toNonNegativeFiniteNumber(input.units);
  const brokerFeeType = normalizeBrokerFeeType(input.brokerFeeType);
  const brokerFeeValue = resolveBrokerFeeValue({
    brokerFeeValue: input.brokerFeeValue,
    brokerFeePct: input.brokerFeePct,
  });

  if (brokerFeeType === "fixed") {
    return brokerFeeValue;
  }

  if (brokerFeeValue === 0 || grossAmount === 0) {
    return 0;
  }

  return (grossAmount * brokerFeeValue) / 100;
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
