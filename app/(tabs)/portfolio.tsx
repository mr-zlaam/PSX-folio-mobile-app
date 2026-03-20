import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import ShariahChip from "@/components/ui/shariah-chip";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
  PortfolioHolding,
} from "@/src/features/portfolio/portfolio-data";
import { subscribeToTradeMutations } from "@/src/features/trade/trade-events";
import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import {
  getPortfolioDisplayModePreference,
  getPortfolioGroupingModePreference,
  setPortfolioDisplayModePreference,
  setPortfolioGroupingModePreference,
} from "@/src/lib/app-preferences";
import { APP_COLORS } from "@/src/theme/colors";

const PORTFOLIO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type PortfolioGroupingMode = "companies" | "sectors";
type PortfolioDisplayMode = "price" | "percentage";

type SectorAggregate = {
  sectorName: string;
  value: number;
  pnl: number;
  pnlPct: number;
  sharePct: number;
  holdingCount: number;
};

function getValueToneClassName(value: number): string {
  if (value > 0) {
    return "text-success-green";
  }

  if (value < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Math.round(value).toLocaleString("en-PK");
}

function formatSignedPriceDelta(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  const signPrefix = value > 0 ? "+" : "";
  return `${signPrefix}${value.toFixed(2)}`;
}

function formatUnsignedPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  return `${Math.abs(value).toFixed(1)}%`;
}

function buildSectorAggregates(holdings: PortfolioHolding[]): SectorAggregate[] {
  const totalValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const bySector = new Map<string, Omit<SectorAggregate, "pnlPct" | "sharePct">>();

  for (const holding of holdings) {
    const sectorName = holding.sectorName?.trim().length
      ? holding.sectorName.trim().toUpperCase()
      : "UNKNOWN";

    const current = bySector.get(sectorName) ?? {
      sectorName,
      value: 0,
      pnl: 0,
      holdingCount: 0,
    };

    current.value += holding.marketValue;
    current.pnl += holding.pnl;
    current.holdingCount += 1;

    bySector.set(sectorName, current);
  }

  return Array.from(bySector.values())
    .map((sector) => {
      const invested = holdings
        .filter((holding) => {
          const normalizedSector = holding.sectorName?.trim().length
            ? holding.sectorName.trim().toUpperCase()
            : "UNKNOWN";
          return normalizedSector === sector.sectorName;
        })
        .reduce((sum, holding) => sum + holding.invested, 0);
      const pnlPct = invested === 0 ? 0 : (sector.pnl / invested) * 100;
      const sharePct = totalValue === 0 ? 0 : (sector.value / totalValue) * 100;

      return {
        ...sector,
        pnlPct,
        sharePct,
      };
    })
    .sort((firstSector, secondSector) => secondSector.value - firstSector.value);
}

function ModeSegmentButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className={[
        "flex-1 rounded-xl px-3 py-2",
        selected
          ? "bg-app-highlight dark:bg-app-highlightDark"
          : "bg-app-highlight/5 dark:border dark:border-app-highlightDark/30 dark:bg-brand-white/5",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-[11px] font-semibold",
          selected
            ? "text-brand-white dark:text-brand-purple"
            : "text-app-text dark:text-app-textDark",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function CompactHoldingCard({
  holding,
  displayMode,
  totalInvested,
  isShariahCompliant,
  onPress,
}: {
  holding: PortfolioHolding;
  displayMode: PortfolioDisplayMode;
  totalInvested: number;
  isShariahCompliant: boolean;
  onPress: () => void;
}) {
  const changeValueText =
    displayMode === "price"
      ? formatSignedPriceDelta(holding.priceDiff)
      : formatSignedPercentage(holding.priceDiffPct);
  const changeToneClassName =
    displayMode === "price"
      ? getValueToneClassName(holding.priceDiff)
      : getValueToneClassName(holding.priceDiffPct);
  const investedSharePct =
    totalInvested === 0 ? 0 : (holding.invested / totalInvested) * 100;
  const investedValueText =
    displayMode === "price"
      ? formatPKRAmount(holding.invested)
      : formatUnsignedPercentage(investedSharePct);
  const investedLabel = displayMode === "price" ? "Invested" : "Invested Share";

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      className="rounded-2xl bg-brand-white px-3 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
    >
      <View className="flex-row items-start justify-between">
        <View className="mr-2 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-xl font-extrabold text-app-text dark:text-app-textDark">
              {holding.symbol}
            </Text>
            {isShariahCompliant ? <ShariahChip compact /> : null}
          </View>
          <Text
            className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark"
            numberOfLines={1}
          >
            {holding.companyName}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
            {holding.currentPrice.toFixed(2)}
          </Text>
          <Text
            className={["mt-1 text-base font-extrabold", changeToneClassName]
              .filter(Boolean)
              .join(" ")}
          >
            {changeValueText}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-start justify-between">
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
            High
          </Text>
          <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
            {holding.highPrice.toFixed(2)}
          </Text>
        </View>

        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
            Low
          </Text>
          <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
            {holding.lowPrice.toFixed(2)}
          </Text>
        </View>

        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
            Volume
          </Text>
          <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
            {formatCompactNumber(holding.lastVolume)}
          </Text>
        </View>

        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
            LDC
          </Text>
          <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
            {holding.previousClose.toFixed(2)}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between rounded-xl bg-app-highlight/5 px-3 py-2 dark:bg-brand-white/5">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
          {investedLabel}
        </Text>
        <Text className="text-sm font-extrabold text-app-text dark:text-app-textDark">
          {investedValueText}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function SectorCard({
  sector,
  displayMode,
  onPress,
}: {
  sector: SectorAggregate;
  displayMode: PortfolioDisplayMode;
  onPress: () => void;
}) {
  const headlineValue =
    displayMode === "price"
      ? formatPKRAmount(sector.value)
      : formatUnsignedPercentage(sector.sharePct);
  const headlineLabel = displayMode === "price" ? "Total Value" : "Portfolio Share";

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      className="rounded-2xl bg-brand-white px-3 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
    >
      <View className="flex-row items-start justify-between">
        <View className="mr-2 flex-1">
          <Text className="text-base font-extrabold text-app-text dark:text-app-textDark">
            {sector.sectorName}
          </Text>
          <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
            {sector.holdingCount} {sector.holdingCount === 1 ? "company" : "companies"}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-lg font-extrabold text-app-text dark:text-app-textDark">
            {headlineValue}
          </Text>
          <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
            {headlineLabel}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
          Profit / Loss
        </Text>
        <Text
          className={["text-sm font-extrabold", getValueToneClassName(sector.pnl)]
            .filter(Boolean)
            .join(" ")}
        >
          {formatSignedPercentage(sector.pnlPct)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PortfolioTabScreen() {
  const router = useRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const [holdings, setHoldings] = React.useState<PortfolioHolding[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isFilterPanelVisible, setIsFilterPanelVisible] = React.useState(false);
  const [groupingMode, setGroupingMode] = React.useState<PortfolioGroupingMode>("sectors");
  const [displayMode, setDisplayMode] = React.useState<PortfolioDisplayMode>("percentage");
  const [hasHydratedViewPreferences, setHasHydratedViewPreferences] =
    React.useState(false);
  const sectorAggregates = React.useMemo(() => buildSectorAggregates(holdings), [holdings]);
  const totalInvested = React.useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.invested, 0),
    [holdings]
  );

  const refreshPortfolio = React.useCallback(async () => {
    const cachedHoldings = await getPortfolioHoldingsWithCachedQuotes();
    setHoldings(cachedHoldings);

    const latestHoldings = await getPortfolioHoldingsWithLatestQuotes();
    setHoldings(latestHoldings);
  }, []);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshPortfolio();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshPortfolio]);

  React.useEffect(() => {
    let isMounted = true;

    async function hydrateViewPreferences() {
      const [savedGroupingMode, savedDisplayMode] = await Promise.all([
        getPortfolioGroupingModePreference(),
        getPortfolioDisplayModePreference(),
      ]);

      if (!isMounted) {
        return;
      }

      setGroupingMode(savedGroupingMode);
      setDisplayMode(savedDisplayMode);
      setHasHydratedViewPreferences(true);
    }

    void hydrateViewPreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!hasHydratedViewPreferences) {
      return;
    }

    void setPortfolioGroupingModePreference(groupingMode);
    void setPortfolioDisplayModePreference(displayMode);
  }, [displayMode, groupingMode, hasHydratedViewPreferences]);

  React.useEffect(() => {
    void refreshPortfolio();
    const intervalId = setInterval(() => {
      void refreshPortfolio();
    }, PORTFOLIO_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshPortfolio]);

  React.useEffect(() => {
    const unsubscribe = subscribeToTradeMutations(() => {
      void refreshPortfolio();
    });

    return unsubscribe;
  }, [refreshPortfolio]);

  const handleOpenHolding = React.useCallback(
    (symbol: string) => {
      router.push({
        pathname: "/portfolio-position",
        params: {
          symbol: symbol.trim().toUpperCase(),
        },
      });
    },
    [router]
  );

  const handleOpenSector = React.useCallback(
    (sectorName: string) => {
      router.push({
        pathname: "/portfolio-sector",
        params: {
          sector: sectorName.trim().toUpperCase(),
          display: displayMode,
        },
      });
    },
    [displayMode, router]
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 88,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
            colors={[isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple]}
            progressBackgroundColor={
              isDarkMode ? APP_COLORS.brand.purple : APP_COLORS.brand.white
            }
          />
        }
      >
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
              Portfolio
            </Text>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setIsFilterPanelVisible((currentValue) => !currentValue)}
              className="flex-row items-center gap-1 rounded-xl bg-app-highlight/10 px-3 py-2 dark:bg-brand-white/10"
            >
              <MaterialCommunityIcons
                name={isFilterPanelVisible ? "close" : "filter-variant"}
                size={18}
                color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
              />
              <Text className="text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                Filter
              </Text>
            </TouchableOpacity>
          </View>

          {isFilterPanelVisible ? (
            <View className="rounded-2xl bg-brand-white p-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/30 dark:bg-brand-white/10">
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Filters
                </Text>
                <Text className="text-[11px] font-semibold text-app-text dark:text-app-textDark">
                  {groupingMode === "sectors" ? "Sectors" : "Companies"} •{" "}
                  {displayMode === "percentage" ? "%" : "PKR"}
                </Text>
              </View>

              <View className="mt-2 flex-row gap-2">
                <ModeSegmentButton
                  label="Sectors"
                  selected={groupingMode === "sectors"}
                  onPress={() => setGroupingMode("sectors")}
                />
                <ModeSegmentButton
                  label="Companies"
                  selected={groupingMode === "companies"}
                  onPress={() => setGroupingMode("companies")}
                />
              </View>

              <View className="mt-2 flex-row gap-2">
                <ModeSegmentButton
                  label="Percentage"
                  selected={displayMode === "percentage"}
                  onPress={() => setDisplayMode("percentage")}
                />
                <ModeSegmentButton
                  label="Price"
                  selected={displayMode === "price"}
                  onPress={() => setDisplayMode("price")}
                />
              </View>
            </View>
          ) : null}

          {holdings.length === 0 ? (
            <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <Text className="text-base font-semibold text-app-text dark:text-app-textDark">
                No holdings yet.
              </Text>
              <Text className="mt-2 text-sm text-app-text dark:text-app-textDark">
                Buy shares first, then your portfolio cards will appear here.
              </Text>
            </View>
          ) : groupingMode === "companies" ? (
            <View className="gap-3">
              {holdings.map((holding) => (
                <CompactHoldingCard
                  key={holding.symbol}
                  holding={holding}
                  displayMode={displayMode}
                  totalInvested={totalInvested}
                  isShariahCompliant={isShariahCompliantSymbol(holding.symbol)}
                  onPress={() => handleOpenHolding(holding.symbol)}
                />
              ))}
            </View>
          ) : (
            <View className="gap-3">
              {sectorAggregates.map((sector) => (
                <SectorCard
                  key={sector.sectorName}
                  sector={sector}
                  displayMode={displayMode}
                  onPress={() => handleOpenSector(sector.sectorName)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
