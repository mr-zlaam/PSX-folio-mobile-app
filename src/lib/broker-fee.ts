export type BrokerFeeType = "percentage" | "fixed";
export type BrokerCommissionModel = "flat" | "slabs";
export type BrokerCommissionRuleType =
  | "percentage"
  | "perShare"
  | "fixedOrder"
  | "maxPercentageOrPerShare";

export type BrokerCommissionRule = {
  id?: string;
  minSharePrice: number;
  maxSharePrice: number | null;
  type: BrokerCommissionRuleType;
  percentageRate?: number | null;
  perShareCharge?: number | null;
  fixedCharge?: number | null;
};

type BrokerFeeInput = {
  price: number;
  units: number;
  brokerFeeType?: BrokerFeeType | null;
  brokerFeeValue?: number | null;
  brokerFeePct?: number | null;
  brokerCommissionModel?: BrokerCommissionModel | null;
  brokerCommissionRules?: BrokerCommissionRule[] | null;
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

export function normalizeBrokerCommissionModel(
  value: BrokerCommissionModel | string | null | undefined
): BrokerCommissionModel {
  return value === "slabs" ? "slabs" : "flat";
}

export function normalizeBrokerCommissionRuleType(
  value: BrokerCommissionRuleType | string | null | undefined
): BrokerCommissionRuleType {
  if (value === "perShare") {
    return "perShare";
  }
  if (value === "fixedOrder") {
    return "fixedOrder";
  }
  if (value === "maxPercentageOrPerShare") {
    return "maxPercentageOrPerShare";
  }
  return "percentage";
}

function parseNonNegativeFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function normalizeBrokerCommissionRule(
  rawValue: unknown
): BrokerCommissionRule | null {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return null;
  }

  const parsedValue = rawValue as Partial<BrokerCommissionRule>;
  const minSharePrice = parseNonNegativeFiniteNumber(parsedValue.minSharePrice);
  if (minSharePrice === null) {
    return null;
  }

  const normalizedRuleType = normalizeBrokerCommissionRuleType(parsedValue.type);
  const maxSharePriceRaw =
    typeof parsedValue.maxSharePrice === "number" && Number.isFinite(parsedValue.maxSharePrice)
      ? parsedValue.maxSharePrice
      : parsedValue.maxSharePrice === null
        ? null
        : null;
  const maxSharePrice =
    maxSharePriceRaw === null
      ? null
      : parseNonNegativeFiniteNumber(maxSharePriceRaw);
  if (maxSharePrice !== null && maxSharePrice < minSharePrice) {
    return null;
  }

  const percentageRate = parseNonNegativeFiniteNumber(parsedValue.percentageRate);
  const perShareCharge = parseNonNegativeFiniteNumber(parsedValue.perShareCharge);
  const fixedCharge = parseNonNegativeFiniteNumber(parsedValue.fixedCharge);

  if (normalizedRuleType === "percentage" && percentageRate === null) {
    return null;
  }
  if (normalizedRuleType === "perShare" && perShareCharge === null) {
    return null;
  }
  if (normalizedRuleType === "fixedOrder" && fixedCharge === null) {
    return null;
  }
  if (
    normalizedRuleType === "maxPercentageOrPerShare" &&
    (percentageRate === null || perShareCharge === null)
  ) {
    return null;
  }

  return {
    id: typeof parsedValue.id === "string" ? parsedValue.id : undefined,
    minSharePrice,
    maxSharePrice,
    type: normalizedRuleType,
    percentageRate,
    perShareCharge,
    fixedCharge,
  };
}

export function normalizeBrokerCommissionRules(
  value: unknown
): BrokerCommissionRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((rule) => normalizeBrokerCommissionRule(rule))
    .filter((rule): rule is BrokerCommissionRule => rule !== null);
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

function doesBrokerRuleMatchPrice(
  rule: BrokerCommissionRule,
  price: number
): boolean {
  if (price < rule.minSharePrice) {
    return false;
  }

  if (rule.maxSharePrice === null) {
    return true;
  }

  return price <= rule.maxSharePrice;
}

function calculateCommissionAmountFromRule(input: {
  rule: BrokerCommissionRule;
  grossAmount: number;
  units: number;
}): number {
  const safeGrossAmount = toNonNegativeFiniteNumber(input.grossAmount);
  const safeUnits = toNonNegativeFiniteNumber(input.units);
  const { rule } = input;

  if (rule.type === "perShare") {
    return safeUnits * toNonNegativeFiniteNumber(rule.perShareCharge ?? 0);
  }

  if (rule.type === "fixedOrder") {
    return toNonNegativeFiniteNumber(rule.fixedCharge ?? 0);
  }

  if (rule.type === "maxPercentageOrPerShare") {
    const percentageAmount =
      (safeGrossAmount * toNonNegativeFiniteNumber(rule.percentageRate ?? 0)) / 100;
    const perShareAmount =
      safeUnits * toNonNegativeFiniteNumber(rule.perShareCharge ?? 0);
    return Math.max(percentageAmount, perShareAmount);
  }

  return (safeGrossAmount * toNonNegativeFiniteNumber(rule.percentageRate ?? 0)) / 100;
}

export function calculateBrokerCommissionAmount(
  input: BrokerFeeInput
): number {
  const safePrice = toNonNegativeFiniteNumber(input.price);
  const safeUnits = toNonNegativeFiniteNumber(input.units);
  const grossAmount = safePrice * safeUnits;
  if (safeUnits <= 0 || grossAmount <= 0) {
    return 0;
  }

  const commissionModel = normalizeBrokerCommissionModel(
    input.brokerCommissionModel
  );
  const commissionRules = normalizeBrokerCommissionRules(
    input.brokerCommissionRules
  );

  if (commissionModel === "slabs" && commissionRules.length > 0) {
    const matchedRule = commissionRules.find((rule) =>
      doesBrokerRuleMatchPrice(rule, safePrice)
    );
    if (matchedRule) {
      return calculateCommissionAmountFromRule({
        rule: matchedRule,
        grossAmount,
        units: safeUnits,
      });
    }
  }

  const brokerFeeType = normalizeBrokerFeeType(input.brokerFeeType);
  const brokerFeeValue = resolveBrokerFeeValue({
    brokerFeeValue: input.brokerFeeValue,
    brokerFeePct: input.brokerFeePct,
  });

  if (brokerFeeType === "fixed") {
    return brokerFeeValue;
  }
  if (brokerFeeValue !== 0 && grossAmount !== 0) {
    return (grossAmount * brokerFeeValue) / 100;
  }

  return 0;
}

export function calculateBrokerDeductionBreakdown(
  input: BrokerFeeInput
): BrokerDeductionBreakdown {
  const safeUnits = toNonNegativeFiniteNumber(input.units);
  const brokerCommissionAmount = calculateBrokerCommissionAmount(input);

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
