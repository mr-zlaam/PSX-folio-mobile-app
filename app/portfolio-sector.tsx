import React from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/src/lib/navigation";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppBackgroundRefreshIndicator from "@/components/ui/app-background-refresh-indicator";
import { AppListScreenSkeleton } from "@/components/ui/app-skeleton";
import ShariahChip from "@/components/ui/shariah-chip";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
  PortfolioHolding,
} from "@/src/features/portfolio/portfolio-data";
import {
  formatCompactPKRAmount,
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import {
  getPortfolioDisplayModePreference,
  setPortfolioDisplayModePreference,
} from "@/src/lib/app-preferences";
import { useBackgroundSyncIndicator } from "@/src/lib/use-background-sync-indicator";
import { getCachedDpsMarketStatus } from "@/src/features/market/dps-market-status";
import { APP_COLORS } from "@/src/theme/colors";

const SECTOR_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type PortfolioDisplayMode = "price" | "percentage";

function getValueToneClassName(value: number): string {
  if (value > 0) {
    return "text-success-green";
  }

  if (value < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function formatUnsignedPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  return `${Math.abs(value).toFixed(1)}%`;
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

function isCompactPkrValue(value: number): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }

  return Math.abs(value) >= 100_000;
}

function getHoldingSectorName(holding: PortfolioHolding): string {
  return holding.sectorName?.trim().length
    ? holding.sectorName.trim().toUpperCase()
    : "UNKNOWN";
}

function FilterChip({
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
        "rounded-xl border px-3 py-2",
        selected
          ? "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
          : "border-app-highlight bg-button-neutral dark:border-app-highlightDark dark:bg-transparent",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-xs font-bold uppercase tracking-wide",
          selected
            ? "text-brand-white dark:text-brand-purple"
            : "text-app-highlight dark:text-app-highlightDark",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SectorCompanyCard({
  holding,
  displayMode,
  portfolioTotalInvested,
  isShariahCompliant,
  onPress,
}: {
  holding: PortfolioHolding;
  displayMode: PortfolioDisplayMode;
  portfolioTotalInvested: number;
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
    portfolioTotalInvested === 0
      ? 0
      : (holding.invested / portfolioTotalInvested) * 100;
  const isPriceMode = displayMode === "price";
  const isInvestedCompact = isPriceMode && isCompactPkrValue(holding.invested);
  const investedValueText =
    isPriceMode
      ? isInvestedCompact
        ? formatCompactPKRAmount(holding.invested, { compactFrom: 100_000 })
        : formatPKRAmount(holding.invested)
      : formatUnsignedPercentage(investedSharePct);
  const investedLabel = isPriceMode ? "Invested" : "Invested Share";
  const currentSharePct =
    portfolioTotalInvested === 0
      ? 0
      : (holding.marketValue / portfolioTotalInvested) * 100;
  const isCurrentCompact = isPriceMode && isCompactPkrValue(holding.marketValue);
  const currentValueText =
    isPriceMode
      ? isCurrentCompact
        ? formatCompactPKRAmount(holding.marketValue, { compactFrom: 100_000 })
        : formatPKRAmount(holding.marketValue)
      : formatUnsignedPercentage(currentSharePct);
  const currentLabel = isPriceMode ? "Current" : "Current Value";
  const currentValueToneClassName = getValueToneClassName(holding.pnl);
  const [activeMetricTooltipKey, setActiveMetricTooltipKey] = React.useState<
    "invested" | "current" | null
  >(null);
  const metricTooltipTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  React.useEffect(() => {
    return () => {
      if (metricTooltipTimeoutRef.current) {
        clearTimeout(metricTooltipTimeoutRef.current);
      }
    };
  }, []);

  const showMetricTooltip = React.useCallback(
    (metricKey: "invested" | "current") => {
      setActiveMetricTooltipKey(metricKey);
      if (metricTooltipTimeoutRef.current) {
        clearTimeout(metricTooltipTimeoutRef.current);
      }

      metricTooltipTimeoutRef.current = setTimeout(() => {
        setActiveMetricTooltipKey((currentValue) =>
          currentValue === metricKey ? null : currentValue
        );
      }, 2000);
    },
    []
  );

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
        <View className="flex-1 pr-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
            {investedLabel}
          </Text>
          <View className="relative mt-1 self-start">
            {isPriceMode &&
            isInvestedCompact &&
            activeMetricTooltipKey === "invested" ? (
              <View className="absolute -top-9 left-0 z-20 rounded-lg bg-app-highlight px-2.5 py-1.5 dark:bg-brand-white/90">
                <Text className="text-[11px] font-semibold text-brand-white dark:text-brand-purple">
                  {formatPKRAmount(holding.invested)}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              activeOpacity={isPriceMode && isInvestedCompact ? 0.82 : 1}
              disabled={!(isPriceMode && isInvestedCompact)}
              onPress={() => showMetricTooltip("invested")}
            >
              <Text className="text-sm font-extrabold text-app-text dark:text-app-textDark">
                {investedValueText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="h-7 w-px bg-app-highlight/20 dark:bg-brand-white/15" />

        <View className="flex-1 items-end pl-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
            {currentLabel}
          </Text>
          <View className="relative mt-1 self-end">
            {isPriceMode &&
            isCurrentCompact &&
            activeMetricTooltipKey === "current" ? (
              <View className="absolute -top-9 right-0 z-20 rounded-lg bg-app-highlight px-2.5 py-1.5 dark:bg-brand-white/90">
                <Text className="text-[11px] font-semibold text-brand-white dark:text-brand-purple">
                  {formatPKRAmount(holding.marketValue)}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              activeOpacity={isPriceMode && isCurrentCompact ? 0.82 : 1}
              disabled={!(isPriceMode && isCurrentCompact)}
              onPress={() => showMetricTooltip("current")}
            >
              <Text
                className={["text-sm font-extrabold", currentValueToneClassName]
                  .filter(Boolean)
                  .join(" ")}
              >
                {currentValueText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function PortfolioSectorScreen() {
  const router = useGuardedRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchParams = useLocalSearchParams<{
    sector?: string | string[];
    display?: string | string[];
  }>();
  const normalizedSectorName = React.useMemo(() => {
    const rawSectorName = Array.isArray(searchParams.sector)
      ? searchParams.sector[0]
      : searchParams.sector;
    return (rawSectorName ?? "").trim().toUpperCase();
  }, [searchParams.sector]);
  const requestedDisplayMode = React.useMemo<PortfolioDisplayMode | null>(() => {
    const rawDisplayMode = Array.isArray(searchParams.display)
      ? searchParams.display[0]
      : searchParams.display;

    if (rawDisplayMode === "price" || rawDisplayMode === "percentage") {
      return rawDisplayMode;
    }

    return null;
  }, [searchParams.display]);

  const [displayMode, setDisplayMode] = React.useState<PortfolioDisplayMode>("percentage");
  const [hasHydratedDisplayMode, setHasHydratedDisplayMode] = React.useState(false);
  const [holdings, setHoldings] = React.useState<PortfolioHolding[]>([]);
  const [portfolioTotalInvested, setPortfolioTotalInvested] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const {
    isBackgroundSyncing,
    beginBackgroundSync,
    endBackgroundSync,
  } = useBackgroundSyncIndicator();
  const sectorSkeletonCardCount = React.useMemo(
    () =>
      Math.max(
        4,
        Math.ceil(Math.max(windowHeight - insets.bottom - 220, 420) / 150)
      ),
    [insets.bottom, windowHeight]
  );

  React.useEffect(() => {
    let isMounted = true;

    async function hydrateDisplayMode() {
      if (requestedDisplayMode) {
        setDisplayMode(requestedDisplayMode);
        setHasHydratedDisplayMode(true);
        return;
      }

      const savedDisplayMode = await getPortfolioDisplayModePreference();
      if (!isMounted) {
        return;
      }

      setDisplayMode(savedDisplayMode);
      setHasHydratedDisplayMode(true);
    }

    void hydrateDisplayMode();

    return () => {
      isMounted = false;
    };
  }, [requestedDisplayMode]);

  React.useEffect(() => {
    if (!hasHydratedDisplayMode) {
      return;
    }

    void setPortfolioDisplayModePreference(displayMode);
  }, [displayMode, hasHydratedDisplayMode]);

  const applySectorHoldings = React.useCallback(
    (allHoldings: PortfolioHolding[]) => {
      const nextPortfolioTotalInvested = allHoldings.reduce(
        (sum, holding) => sum + holding.invested,
        0
      );
      const nextSectorHoldings = allHoldings
        .filter((holding) => getHoldingSectorName(holding) === normalizedSectorName)
        .sort((firstHolding, secondHolding) =>
          secondHolding.marketValue - firstHolding.marketValue
        );

      setPortfolioTotalInvested(nextPortfolioTotalInvested);
      setHoldings(nextSectorHoldings);
    },
    [normalizedSectorName]
  );

  const refreshSector = React.useCallback(
    async (showLoader = false, forceLive = false) => {
      let didStartBackgroundSync = false;
      if (showLoader) {
        setIsInitialLoading(true);
      }

      try {
        if (normalizedSectorName.length === 0) {
          setPortfolioTotalInvested(0);
          setHoldings([]);
          return;
        }

        const cachedHoldings = await getPortfolioHoldingsWithCachedQuotes();
        applySectorHoldings(cachedHoldings);
        const hasUsableCachedHoldings =
          cachedHoldings.length === 0 ||
          cachedHoldings.some((holding) => {
            return (
              holding.asOf !== null ||
              holding.currentPrice > 0 ||
              holding.previousClose > 0
            );
          });
        if (showLoader && hasUsableCachedHoldings) {
          setIsInitialLoading(false);
        }

        let shouldFetchLive = forceLive || !hasUsableCachedHoldings;
        if (!forceLive) {
          try {
            const cachedMarketStatus = await getCachedDpsMarketStatus();
            shouldFetchLive =
              cachedMarketStatus.uiStatus === "OPEN" || !hasUsableCachedHoldings;
          } catch {
            shouldFetchLive = true;
          }
        }

        if (!shouldFetchLive) {
          return;
        }

        if (!showLoader && hasUsableCachedHoldings) {
          beginBackgroundSync();
          didStartBackgroundSync = true;
        }

        const latestHoldings = await getPortfolioHoldingsWithLatestQuotes();
        applySectorHoldings(latestHoldings);
      } finally {
        if (didStartBackgroundSync) {
          endBackgroundSync();
        }
        if (showLoader) {
          setIsInitialLoading(false);
        }
      }
    },
    [applySectorHoldings, beginBackgroundSync, endBackgroundSync, normalizedSectorName]
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshSector(false, true);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshSector]);

  React.useEffect(() => {
    void refreshSector(true);
    const intervalId = setInterval(() => {
      void refreshSector();
    }, SECTOR_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshSector]);

  const handleOpenCompany = React.useCallback(
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
          paddingBottom: insets.bottom + 32,
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
        <View className="gap-5">
          <View className="flex-row items-center justify-between">
            <AppBackIconButton onPress={() => router.back()} />

            <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Sector
            </Text>

            <View className="w-14" />
          </View>

          <View className="rounded-2xl bg-brand-white/95 p-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              {normalizedSectorName || "UNKNOWN"}
            </Text>
            <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
              Tap a company to open detail page.
            </Text>
            <View className="mt-3 flex-row gap-2">
              <FilterChip
                label="Percentage"
                selected={displayMode === "percentage"}
                onPress={() => setDisplayMode("percentage")}
              />
              <FilterChip
                label="Price"
                selected={displayMode === "price"}
                onPress={() => setDisplayMode("price")}
              />
            </View>
          </View>

          <View className="flex-row items-center justify-end">
            <AppBackgroundRefreshIndicator
              visible={isBackgroundSyncing}
              label="Refreshing"
            />
          </View>

          {isInitialLoading ? (
            <View
              style={{
                minHeight: Math.max(windowHeight - insets.bottom - 120, 560),
              }}
            >
              <AppListScreenSkeleton cardCount={sectorSkeletonCardCount} />
            </View>
          ) : holdings.length === 0 ? (
            <View className="rounded-2xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
              <Text className="text-base font-semibold text-app-text dark:text-app-textDark">
                No companies found in this sector.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {holdings.map((holding) => (
                <SectorCompanyCard
                  key={holding.symbol}
                  holding={holding}
                  displayMode={displayMode}
                  portfolioTotalInvested={portfolioTotalInvested}
                  isShariahCompliant={isShariahCompliantSymbol(holding.symbol)}
                  onPress={() => handleOpenCompany(holding.symbol)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
