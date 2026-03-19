import { describe, expect, test } from "bun:test";
import {
  buildHomeViewModel,
  getValueTone,
  sanitizeHomeSnapshot,
} from "@/src/features/home/home-view-model";

describe("home-view-model", () => {
  test("maps value tone correctly", () => {
    expect(getValueTone(100)).toBe("positive");
    expect(getValueTone(-1)).toBe("negative");
    expect(getValueTone(0)).toBe("neutral");
  });

  test("builds full summary and insights", () => {
    const model = buildHomeViewModel({
      summary: {
        invested: 100000,
        value: 112000,
        profit: 12000,
        returnPct: 12,
      },
      insights: [
        { label: "Top Stock", symbol: "MEBL", valueText: "38%" },
        { label: "Best Gain", symbol: "FFC", valueText: "+8%" },
        { label: "Worst Loss", symbol: "LUCK", valueText: "-3%" },
      ],
    });

    expect(model.summaryItems).toHaveLength(4);
    expect(model.insights).toHaveLength(3);
    expect(model.summaryItems[2]?.tone).toBe("positive");
    expect(model.summaryItems[3]?.value).toBe("+12.0%");
  });

  test("uses safe fallbacks for missing values", () => {
    const sanitized = sanitizeHomeSnapshot(undefined);

    expect(sanitized.summary.invested).toBe(0);
    expect(sanitized.summary.value).toBe(0);
    expect(sanitized.summary.profit).toBe(0);
    expect(sanitized.summary.returnPct).toBe(0);
    expect(sanitized.insights).toHaveLength(3);
    expect(sanitized.insights[0]?.label).toBe("Top Stock");
    expect(sanitized.insights[1]?.label).toBe("Best Gain");
    expect(sanitized.insights[2]?.label).toBe("Worst Loss");
  });

  test("normalizes and recovers invalid insight values", () => {
    const sanitized = sanitizeHomeSnapshot({
      insights: [
        { label: "Top Stock", symbol: "  mebl  ", valueText: " 40% " },
        { label: "Best Gain", symbol: "", valueText: "" },
        { label: "Worst Loss", symbol: " luck", valueText: " -3%" },
      ],
    });

    expect(sanitized.insights[0]?.symbol).toBe("MEBL");
    expect(sanitized.insights[0]?.valueText).toBe("40%");
    expect(sanitized.insights[1]?.symbol).toBe("-");
    expect(sanitized.insights[1]?.valueText).toBe("N/A");
    expect(sanitized.insights[2]?.symbol).toBe("LUCK");
    expect(sanitized.insights[2]?.valueText).toBe("-3%");
  });
});
