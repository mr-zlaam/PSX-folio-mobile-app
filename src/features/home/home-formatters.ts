const PKR_FORMATTER = new Intl.NumberFormat("en-PK", {
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
