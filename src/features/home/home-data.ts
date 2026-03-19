import { HomeSnapshot } from "@/src/features/home/types";

export const MOCK_LATEST_KSE100_POINTS = 154292.25;
export type InsightDisplayMode = "percentage" | "price";

export const HOME_PLACEHOLDER_SNAPSHOT: HomeSnapshot = {
  summary: {
    invested: 100000,
    value: 112000,
    profit: 12000,
    returnPct: 12,
  },
  insights: [
    {
      label: "Top Stock",
      symbol: "MEBL",
      valueText: "38% of portfolio",
    },
    {
      label: "Best Gain",
      symbol: "FFC",
      valueText: "+8.0%",
    },
    {
      label: "Worst Loss",
      symbol: "LUCK",
      valueText: "-3.0%",
    },
  ],
};

const HOME_INSIGHT_DISPLAY_VALUES: Record<
  string,
  { percentage: string; price: string }
> = {
  MEBL: {
    percentage: "38% of portfolio",
    price: "PKR 42,560",
  },
  FFC: {
    percentage: "+8.0%",
    price: "+PKR 3,240",
  },
  LUCK: {
    percentage: "-3.0%",
    price: "-PKR 1,180",
  },
};

export function getHomeSnapshot(): HomeSnapshot {
  return HOME_PLACEHOLDER_SNAPSHOT;
}

export function getLatestKse100PointsMock(): number {
  return MOCK_LATEST_KSE100_POINTS;
}

export function getInsightDisplayValue(
  symbol: string,
  mode: InsightDisplayMode,
  fallbackValueText: string
): string {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const valuesBySymbol = HOME_INSIGHT_DISPLAY_VALUES[normalizedSymbol];

  if (!valuesBySymbol) {
    return fallbackValueText;
  }

  return mode === "price" ? valuesBySymbol.price : valuesBySymbol.percentage;
}
