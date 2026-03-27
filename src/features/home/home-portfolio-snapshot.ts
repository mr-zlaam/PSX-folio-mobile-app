import { formatPKRAmount, formatSignedPercentage } from "@/src/features/home/home-formatters";
import { HomeInsightLabel, HomeSnapshot } from "@/src/features/home/types";
import { PortfolioHolding } from "@/src/features/portfolio/portfolio-data";

export type InsightDisplayValues = Record<
  HomeInsightLabel,
  { percentage: string; price: string }
>;

export const DEFAULT_INSIGHT_DISPLAY_VALUES: InsightDisplayValues = {
  "Top Stock": {
    percentage: "0.0% of portfolio",
    price: "PKR 0",
  },
  "Best Gain": {
    percentage: "0.0%",
    price: "PKR 0",
  },
  "Worst Loss": {
    percentage: "Nil",
    price: "Nil",
  },
};

function formatUnsignedPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  return `${Math.abs(value).toFixed(1)}%`;
}

function formatSignedPkrAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return "PKR 0";
  }

  const absoluteValueText = formatPKRAmount(Math.abs(value));
  if (value > 0) {
    return `+${absoluteValueText}`;
  }

  if (value < 0) {
    return `-${absoluteValueText}`;
  }

  return absoluteValueText;
}

function getHoldingWithMaxValue(
  holdings: PortfolioHolding[],
  selector: (holding: PortfolioHolding) => number
): PortfolioHolding | null {
  if (holdings.length === 0) {
    return null;
  }

  return holdings.reduce((bestHolding, currentHolding) =>
    selector(currentHolding) > selector(bestHolding) ? currentHolding : bestHolding
  );
}

function getHoldingWithMinValue(
  holdings: PortfolioHolding[],
  selector: (holding: PortfolioHolding) => number
): PortfolioHolding | null {
  if (holdings.length === 0) {
    return null;
  }

  return holdings.reduce((worstHolding, currentHolding) =>
    selector(currentHolding) < selector(worstHolding) ? currentHolding : worstHolding
  );
}

function getBestGainHoldingByImpact(holdings: PortfolioHolding[]): PortfolioHolding | null {
  const gainingHoldings = holdings.filter((holding) => holding.pnl > 0);
  if (gainingHoldings.length === 0) {
    return null;
  }

  return getHoldingWithMaxValue(gainingHoldings, (holding) => holding.pnl);
}

function getWorstLossHoldingByImpact(holdings: PortfolioHolding[]): PortfolioHolding | null {
  const losingHoldings = holdings.filter((holding) => holding.pnl < 0);
  if (losingHoldings.length === 0) {
    return null;
  }

  return getHoldingWithMinValue(losingHoldings, (holding) => holding.pnl);
}

export function buildHomeSnapshotFromHoldings(
  holdings: PortfolioHolding[],
  options?: {
    contributedCapitalAdjustment?: number;
    returnCashAdjustment?: number;
  }
): {
  snapshot: HomeSnapshot;
  insightDisplayValues: InsightDisplayValues;
} {
  const contributedCapitalAdjustment =
    options &&
    typeof options.contributedCapitalAdjustment === "number" &&
    Number.isFinite(options.contributedCapitalAdjustment) &&
    options.contributedCapitalAdjustment > 0
      ? options.contributedCapitalAdjustment
      : 0;
  const returnCashAdjustment =
    options &&
    typeof options.returnCashAdjustment === "number" &&
    Number.isFinite(options.returnCashAdjustment) &&
    options.returnCashAdjustment > 0
      ? options.returnCashAdjustment
      : 0;
  const totalValueAdjustment = contributedCapitalAdjustment + returnCashAdjustment;

  if (holdings.length === 0) {
    const invested = contributedCapitalAdjustment;
    const value = totalValueAdjustment;
    const profit = value - invested;

    return {
      snapshot: {
        summary: {
          invested,
          value,
          profit,
          returnPct: 0,
        },
        insights: [
          {
            label: "Top Stock",
            symbol: "-",
            valueText: "0.0% of portfolio",
          },
          {
            label: "Best Gain",
            symbol: "-",
            valueText: "0.0%",
          },
          {
            label: "Worst Loss",
            symbol: "Nil",
            valueText: "Nil",
          },
        ],
      },
      insightDisplayValues: DEFAULT_INSIGHT_DISPLAY_VALUES,
    };
  }

  const invested =
    holdings.reduce((sum, holding) => sum + holding.invested, 0) +
    contributedCapitalAdjustment;
  const holdingsValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const value = holdingsValue + totalValueAdjustment;
  const profit = value - invested;
  const returnPct = invested === 0 ? 0 : (profit / invested) * 100;

  const topStock = getHoldingWithMaxValue(holdings, (holding) => holding.marketValue);
  const bestGain = getBestGainHoldingByImpact(holdings);
  const worstLoss = getWorstLossHoldingByImpact(holdings);

  const topStockSharePct =
    topStock && value > 0 ? (topStock.marketValue / value) * 100 : 0;
  const portfolioBaseForImpact = holdingsValue > 0 ? holdingsValue : value;
  const bestGainImpactPct =
    bestGain && portfolioBaseForImpact > 0
      ? (bestGain.pnl / portfolioBaseForImpact) * 100
      : 0;
  const worstLossImpactPct =
    worstLoss && portfolioBaseForImpact > 0
      ? (worstLoss.pnl / portfolioBaseForImpact) * 100
      : 0;

  const insightDisplayValues: InsightDisplayValues = {
    "Top Stock": {
      percentage: `${formatUnsignedPercentage(topStockSharePct)} of portfolio`,
      price: formatPKRAmount(topStock?.marketValue ?? 0),
    },
    "Best Gain": {
      percentage: formatSignedPercentage(bestGainImpactPct),
      price: formatSignedPkrAmount(bestGain?.pnl ?? 0),
    },
    "Worst Loss": {
      percentage: worstLoss ? formatSignedPercentage(worstLossImpactPct) : "Nil",
      price: worstLoss ? formatSignedPkrAmount(worstLoss.pnl) : "Nil",
    },
  };

  return {
    snapshot: {
      summary: {
        invested,
        value,
        profit,
        returnPct,
      },
      insights: [
        {
          label: "Top Stock",
          symbol: topStock?.symbol ?? "-",
          valueText: insightDisplayValues["Top Stock"].percentage,
        },
        {
          label: "Best Gain",
          symbol: bestGain?.symbol ?? "-",
          valueText: insightDisplayValues["Best Gain"].percentage,
        },
        {
          label: "Worst Loss",
          symbol: worstLoss?.symbol ?? "Nil",
          valueText: insightDisplayValues["Worst Loss"].percentage,
        },
      ],
    },
    insightDisplayValues,
  };
}
