import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import {
  HomeInsightItem,
  HomeInsightLabel,
  HomeSnapshot,
  HomeSnapshotInput,
  HomeViewModel,
  ValueTone,
} from "@/src/features/home/types";

const DEFAULT_SUMMARY = {
  invested: 0,
  value: 0,
  profit: 0,
  returnPct: 0,
} as const;

const DEFAULT_INSIGHTS: HomeInsightItem[] = [
  { label: "Top Stock", symbol: "-", valueText: "0" },
  { label: "Best Gain", symbol: "-", valueText: "0" },
  { label: "Worst Loss", symbol: "-", valueText: "0" },
];

const INSIGHT_LABEL_ORDER: HomeInsightLabel[] = [
  "Top Stock",
  "Best Gain",
  "Worst Loss",
];

function getSafeNumber(value: unknown, fallbackValue = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallbackValue;
}

function getSafeSymbol(value: unknown): string {
  if (typeof value !== "string") {
    return "-";
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : "-";
}

function getSafeValueText(value: unknown): string {
  if (typeof value !== "string") {
    return "0";
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "0";
}

function sanitizeInsight(
  label: HomeInsightLabel,
  sourceInsight: Partial<HomeInsightItem> | undefined,
  fallbackInsight: HomeInsightItem,
): HomeInsightItem {
  return {
    label,
    symbol: getSafeSymbol(sourceInsight?.symbol ?? fallbackInsight.symbol),
    valueText: getSafeValueText(
      sourceInsight?.valueText ?? fallbackInsight.valueText,
    ),
  };
}

function getInsightByLabel(
  insights: Partial<HomeInsightItem>[] | undefined,
  label: HomeInsightLabel,
): Partial<HomeInsightItem> | undefined {
  return insights?.find((insight) => insight.label === label);
}

export function sanitizeHomeSnapshot(
  input?: HomeSnapshotInput | null,
): HomeSnapshot {
  const summary = {
    invested: getSafeNumber(input?.summary?.invested, DEFAULT_SUMMARY.invested),
    value: getSafeNumber(input?.summary?.value, DEFAULT_SUMMARY.value),
    profit: getSafeNumber(input?.summary?.profit, DEFAULT_SUMMARY.profit),
    returnPct: getSafeNumber(
      input?.summary?.returnPct,
      DEFAULT_SUMMARY.returnPct,
    ),
  };

  const insights = INSIGHT_LABEL_ORDER.map((label, index) => {
    const sourceInsight = getInsightByLabel(input?.insights, label);
    const fallbackInsight = DEFAULT_INSIGHTS[index];
    return sanitizeInsight(label, sourceInsight, fallbackInsight);
  });

  return { summary, insights };
}

export function getValueTone(value: number): ValueTone {
  if (value > 0) {
    return "positive";
  }

  if (value < 0) {
    return "negative";
  }

  return "neutral";
}

export function buildHomeViewModel(
  input?: HomeSnapshotInput | null,
): HomeViewModel {
  const snapshot = sanitizeHomeSnapshot(input);

  return {
    title: "PSX Folio",
    subtitle: "Know instantly whether your portfolio is in profit or loss.",
    summaryItems: [
      {
        key: "invested",
        label: "Invested",
        hint: "Money you put in",
        value: formatPKRAmount(snapshot.summary.invested),
        tone: "neutral",
      },
      {
        key: "value",
        label: "Value",
        hint: "What it's worth now",
        value: formatPKRAmount(snapshot.summary.value),
        tone: "neutral",
      },
      {
        key: "profit",
        label: "Profit",
        hint: "Gain or loss",
        value: formatPKRAmount(snapshot.summary.profit),
        tone: getValueTone(snapshot.summary.profit),
      },
      {
        key: "returnPct",
        label: "Return",
        hint: "Performance %",
        value: formatSignedPercentage(snapshot.summary.returnPct),
        tone: getValueTone(snapshot.summary.returnPct),
      },
    ],
    insights: snapshot.insights,
  };
}
