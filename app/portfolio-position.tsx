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
import AppButton from "@/components/ui/app-button";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppBackgroundRefreshIndicator from "@/components/ui/app-background-refresh-indicator";
import {
  AppChartSkeleton,
  AppDetailScreenSkeleton,
} from "@/components/ui/app-skeleton";
import ShariahChip from "@/components/ui/shariah-chip";
import StockLineChart from "@/components/charts/stock-line-chart";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
  PortfolioHolding,
} from "@/src/features/portfolio/portfolio-data";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import {
  getCachedStockChartSeries,
  getLatestStockChartSeries,
  getStockChartSeriesFallback,
  StockChartPoint,
  StockChartRange,
  StockChartSeries,
} from "@/src/features/trade/stock-chart-data";
import { useBackgroundSyncIndicator } from "@/src/lib/use-background-sync-indicator";
import { APP_COLORS } from "@/src/theme/colors";

const POSITION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CHART_RANGE_OPTIONS: StockChartRange[] = [
  "1D",
  "1M",
  "6M",
  "YTD",
  "1Y",
  "3Y",
  "5Y",
];

function getValueToneClassName(value: number): string {
  if (value > 0) {
    return "text-success-green";
  }

  if (value < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function formatSignedPriceDelta(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  const signPrefix = value > 0 ? "+" : "";
  return `${signPrefix}${value.toFixed(2)}`;
}

function formatCompactVolume(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Math.round(value).toLocaleString("en-PK");
}

function formatPointTimestamp(
  timestamp: number,
  range: StockChartRange
): string {
  const pointDate = new Date(timestamp);

  if (range === "1D") {
    return pointDate.toLocaleTimeString("en-PK", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return pointDate.toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ChartRangeChip({
  label,
  selected,
  onPress,
}: {
  label: StockChartRange;
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

export default function PortfolioPositionScreen() {
  const router = useGuardedRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchParams = useLocalSearchParams<{ symbol?: string | string[] }>();
  const normalizedSymbol = React.useMemo(() => {
    const rawSymbol = Array.isArray(searchParams.symbol)
      ? searchParams.symbol[0]
      : searchParams.symbol;
    return (rawSymbol ?? "").trim().toUpperCase();
  }, [searchParams.symbol]);

  const [holding, setHolding] = React.useState<PortfolioHolding | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [chartRange, setChartRange] = React.useState<StockChartRange>("1D");
  const [chartSeries, setChartSeries] = React.useState<StockChartSeries>(() =>
    getStockChartSeriesFallback("1D")
  );
  const [isChartLoading, setIsChartLoading] = React.useState(true);
  const [selectedChartPoint, setSelectedChartPoint] =
    React.useState<StockChartPoint | null>(null);
  const chartRequestIdRef = React.useRef(0);
  const {
    isBackgroundSyncing,
    beginBackgroundSync,
    endBackgroundSync,
  } = useBackgroundSyncIndicator();

  const refreshPosition = React.useCallback(
    async (showLoader = false, forceLive = false) => {
      let didStartBackgroundSync = false;
      if (showLoader) {
        setIsInitialLoading(true);
      }

      try {
        if (normalizedSymbol.length === 0) {
          setHolding(null);
          return;
        }

        const cachedHoldings = await getPortfolioHoldingsWithCachedQuotes();
        const cachedHolding =
          cachedHoldings.find((item) => item.symbol === normalizedSymbol) ?? null;
        const hasUsableCachedHolding = Boolean(
          cachedHolding &&
            (cachedHolding.asOf !== null ||
              cachedHolding.currentPrice > 0 ||
              cachedHolding.previousClose > 0)
        );
        if (cachedHolding) {
          setHolding(cachedHolding);
          if (showLoader && hasUsableCachedHolding) {
            setIsInitialLoading(false);
          }
        }

        if (hasUsableCachedHolding && !showLoader && !forceLive) {
          beginBackgroundSync();
          didStartBackgroundSync = true;
        }

        const latestHoldings = await getPortfolioHoldingsWithLatestQuotes();
        const nextHolding =
          latestHoldings.find((item) => item.symbol === normalizedSymbol) ?? null;
        setHolding(nextHolding);
      } finally {
        if (didStartBackgroundSync) {
          endBackgroundSync();
        }
        if (showLoader) {
          setIsInitialLoading(false);
        }
      }
    },
    [beginBackgroundSync, endBackgroundSync, normalizedSymbol]
  );

  const handleTradeAction = React.useCallback(
    (side: "buy" | "sell") => {
      if (!holding) {
        return;
      }

      router.push({
        pathname: "/(tabs)/transactions",
        params: {
          symbol: holding.symbol,
          side,
          lockSymbol: "1",
        },
      });
    },
    [holding, router]
  );

  const refreshChart = React.useCallback(
    async (range: StockChartRange, showLoader = false, forceLive = false) => {
      const requestId = chartRequestIdRef.current + 1;
      chartRequestIdRef.current = requestId;
      let didStartBackgroundSync = false;

      if (showLoader) {
        setIsChartLoading(true);
      }

      try {
        if (normalizedSymbol.length === 0) {
          if (requestId === chartRequestIdRef.current) {
            setChartSeries(getStockChartSeriesFallback(range));
          }
          return;
        }

        const cachedSeries = await getCachedStockChartSeries(normalizedSymbol, range);
        const hasUsableCachedSeries = cachedSeries.points.length > 0;
        if (requestId === chartRequestIdRef.current) {
          setChartSeries(cachedSeries);
          if (showLoader && hasUsableCachedSeries) {
            setIsChartLoading(false);
          }
        }

        if (hasUsableCachedSeries && !showLoader && !forceLive) {
          beginBackgroundSync();
          didStartBackgroundSync = true;
        }

        const latestSeries = await getLatestStockChartSeries(normalizedSymbol, range, {
          forceLive,
        });
        if (requestId === chartRequestIdRef.current) {
          setChartSeries(latestSeries);
        }
      } finally {
        if (didStartBackgroundSync) {
          endBackgroundSync();
        }
        if (showLoader && requestId === chartRequestIdRef.current) {
          setIsChartLoading(false);
        }
      }
    },
    [beginBackgroundSync, endBackgroundSync, normalizedSymbol]
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshPosition(false, true),
        refreshChart(chartRange, false, true),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [chartRange, refreshChart, refreshPosition]);

  React.useEffect(() => {
    void refreshPosition(true);
    const intervalId = setInterval(() => {
      void refreshPosition();
    }, POSITION_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshPosition]);

  React.useEffect(() => {
    setSelectedChartPoint(null);
    void refreshChart(chartRange, true);
    const intervalId = setInterval(() => {
      void refreshChart(chartRange);
    }, POSITION_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [chartRange, refreshChart]);

  const chartToneValue = React.useMemo(() => {
    if (chartSeries.points.length < 2) {
      return 0;
    }

    const firstPrice = chartSeries.points[0].price;
    const lastPrice = chartSeries.points[chartSeries.points.length - 1].price;
    return lastPrice - firstPrice;
  }, [chartSeries.points]);

  const chartLineColor = React.useMemo(() => {
    if (chartToneValue > 0) {
      return APP_COLORS.success.green;
    }

    if (chartToneValue < 0) {
      return APP_COLORS.brand.red;
    }

    return isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple;
  }, [chartToneValue, isDarkMode]);

  const chartGridColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;

  const chartFirstPoint = chartSeries.points[0] ?? null;
  const chartLastPoint = chartSeries.points[chartSeries.points.length - 1] ?? null;

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
              Position
            </Text>

            <View className="w-14" />
          </View>

          {isInitialLoading ? (
            <View
              style={{
                minHeight: Math.max(windowHeight - insets.bottom - 120, 560),
              }}
            >
              <AppDetailScreenSkeleton />
            </View>
          ) : !holding ? (
            <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
              <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
                Position not found
              </Text>
              <Text className="mt-2 text-sm text-app-text dark:text-app-textDark">
                This symbol has no active holding right now.
              </Text>
            </View>
          ) : (
            <>
              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    {holding.symbol}
                  </Text>
                  {isShariahCompliantSymbol(holding.symbol) ? (
                    <ShariahChip compact />
                  ) : null}
                </View>
                <Text className="mt-1 text-xl font-extrabold text-app-text dark:text-app-textDark">
                  {holding.companyName}
                </Text>
                <Text className="mt-1 text-sm text-app-text dark:text-app-textDark">
                  {holding.sectorName}
                </Text>

                <View className="mt-4 flex-row flex-wrap gap-4">
                  <View className="min-w-[44%]">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Avg Buy
                    </Text>
                    <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                      {holding.averageBuyPrice.toFixed(2)}
                    </Text>
                  </View>
                  <View className="min-w-[44%]">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Current
                    </Text>
                    <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                      {holding.currentPrice.toFixed(2)}
                    </Text>
                  </View>
                  <View className="min-w-[44%]">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Units
                    </Text>
                    <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                      {holding.units}
                    </Text>
                  </View>
                  <View className="min-w-[44%]">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Volume
                    </Text>
                    <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                      {formatCompactVolume(holding.lastVolume)}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Position Summary
                </Text>

                <View className="mt-3 gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      Invested
                    </Text>
                    <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                      {formatPKRAmount(holding.invested)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      Market Value
                    </Text>
                    <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                      {formatPKRAmount(holding.marketValue)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      Price Change
                    </Text>
                    <Text
                      className={[
                        "text-sm font-bold",
                        getValueToneClassName(holding.priceDiff),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {`${formatSignedPriceDelta(holding.priceDiff)} (${formatSignedPercentage(
                        holding.priceDiffPct
                      )})`}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      Profit / Loss
                    </Text>
                    <Text
                      className={[
                        "text-sm font-bold",
                        getValueToneClassName(holding.pnl),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {`${formatPKRAmount(holding.pnl)} (${formatSignedPercentage(holding.pnlPct)})`}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <AppButton
                    label="Buy More"
                    variant="primary"
                    size="sm"
                    onPress={() => handleTradeAction("buy")}
                  />
                </View>
                <View className="flex-1">
                  <AppButton
                    label="Sell"
                    variant="danger"
                    size="sm"
                    onPress={() => handleTradeAction("sell")}
                  />
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Performance
                  </Text>
                  <AppBackgroundRefreshIndicator
                    visible={isBackgroundSyncing}
                    label="Syncing"
                  />
                </View>

                <View className="mt-3 flex-row flex-wrap gap-2">
                  {CHART_RANGE_OPTIONS.map((rangeOption) => (
                    <ChartRangeChip
                      key={rangeOption}
                      label={rangeOption}
                      selected={chartRange === rangeOption}
                      onPress={() => setChartRange(rangeOption)}
                    />
                  ))}
                </View>

                {selectedChartPoint ? (
                  <View className="mt-3 rounded-2xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Selected Point
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(selectedChartPoint.price)}
                      </Text>
                    </View>
                    <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                      {formatPointTimestamp(selectedChartPoint.timestamp, chartRange)}
                    </Text>
                  </View>
                ) : null}

                <View className="mt-4">
                  {isChartLoading ? (
                    <AppChartSkeleton />
                  ) : (
                    <StockLineChart
                      points={chartSeries.points}
                      lineColor={chartLineColor}
                      gridColor={chartGridColor}
                      emptyLabel="No performance data for this range"
                      onPointSelected={setSelectedChartPoint}
                    />
                  )}
                </View>

                {chartFirstPoint && chartLastPoint ? (
                  <View className="mt-3 gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Start
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(chartFirstPoint.price)}
                      </Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Latest
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(chartLastPoint.price)}
                      </Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Change
                      </Text>
                      <Text
                        className={[
                          "text-sm font-bold",
                          getValueToneClassName(chartToneValue),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {formatSignedPercentage(
                          chartFirstPoint.price === 0
                            ? 0
                            : (chartToneValue / chartFirstPoint.price) * 100
                        )}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
