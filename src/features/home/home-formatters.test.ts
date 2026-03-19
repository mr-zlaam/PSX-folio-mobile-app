import { describe, expect, test } from "bun:test";
import {
  formatKse100Points,
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";

describe("home-formatters", () => {
  test("formats PKR amounts with separators", () => {
    expect(formatPKRAmount(100000)).toBe("PKR 100,000");
  });

  test("formats signed percentages", () => {
    expect(formatSignedPercentage(12)).toBe("+12.0%");
    expect(formatSignedPercentage(-3.4)).toBe("-3.4%");
    expect(formatSignedPercentage(0)).toBe("0.0%");
  });

  test("returns safe fallback for non-finite values", () => {
    expect(formatPKRAmount(Number.NaN)).toBe("PKR 0");
    expect(formatSignedPercentage(Number.POSITIVE_INFINITY)).toBe("0.0%");
  });

  test("formats KSE-100 points", () => {
    expect(formatKse100Points(154292.25)).toBe("154,292.25");
    expect(formatKse100Points(Number.NaN)).toBe("0.00");
  });
});
