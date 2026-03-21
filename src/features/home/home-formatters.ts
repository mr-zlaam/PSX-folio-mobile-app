const PKR_FORMATTER = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const PKR_COMPACT_FORMATTER = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const KSE_POINTS_FORMATTER = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPKRAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return "PKR 0";
  }

  return `PKR ${PKR_FORMATTER.format(value)}`;
}

export function formatCompactPKRAmount(
  value: number,
  options?: {
    compactFrom?: number;
  }
): string {
  if (!Number.isFinite(value)) {
    return "PKR 0";
  }

  const compactFrom = options?.compactFrom ?? 100_000;
  const absoluteValue = Math.abs(value);
  if (absoluteValue < compactFrom) {
    return formatPKRAmount(value);
  }

  const units = [
    { divisor: 1_000_000_000_000, suffix: "T" },
    { divisor: 1_000_000_000, suffix: "B" },
    { divisor: 1_000_000, suffix: "M" },
    { divisor: 1_000, suffix: "K" },
  ] as const;
  const selectedUnit =
    units.find((unit) => absoluteValue >= unit.divisor) ?? units[units.length - 1];
  const compactValue = value / selectedUnit.divisor;

  return `PKR ${PKR_COMPACT_FORMATTER.format(compactValue)}${selectedUnit.suffix}`;
}

export function formatKse100Points(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  return KSE_POINTS_FORMATTER.format(value);
}

export function formatSignedPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  const absoluteValue = Math.abs(value).toFixed(1);
  if (value > 0) {
    return `+${absoluteValue}%`;
  }

  if (value < 0) {
    return `-${absoluteValue}%`;
  }

  return `0.0%`;
}
