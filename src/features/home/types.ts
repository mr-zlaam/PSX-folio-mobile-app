export type HomeInsightLabel = "Top Stock" | "Best Gain" | "Worst Loss";

export type HomeSummaryMetrics = {
  invested: number;
  value: number;
  profit: number;
  returnPct: number;
};

export type HomeInsightItem = {
  label: HomeInsightLabel;
  symbol: string;
  valueText: string;
};

export type HomeSnapshot = {
  summary: HomeSummaryMetrics;
  insights: HomeInsightItem[];
};

export type HomeSnapshotInput = Partial<{
  summary: Partial<HomeSummaryMetrics>;
  insights: Partial<HomeInsightItem>[];
}>;

export type ValueTone = "positive" | "negative" | "neutral";

export type HomeSummaryDisplayItem = {
  key: "invested" | "value" | "profit" | "returnPct";
  label: string;
  hint: string;
  value: string;
  tone: ValueTone;
};

export type HomeViewModel = {
  title: string;
  subtitle: string;
  summaryItems: HomeSummaryDisplayItem[];
  insights: HomeInsightItem[];
};
