import StockLineChart from "@/components/charts/stock-line-chart";
import ShariahChip from "@/components/ui/shariah-chip";
import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  getCachedSymbols,
  getLatestSymbols,
  getCachedSymbolQuote,
  getLatestSymbolQuote,
  getSymbolQuoteFallback,
  PsxSymbol,
  SymbolQuote,
} from "@/src/features/trade/trade-data";
import {
  getCachedStockChartSeries,
  getLatestStockChartSeries,
  getStockChartSeriesFallback,
  StockChartPoint,
  StockChartRange,
  StockChartSeries,
} from "@/src/features/trade/stock-chart-data";
import { APP_COLORS } from "@/src/theme/colors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const STOCK_DETAIL_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
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

function formatCompactVolume(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return Math.round(value).toLocaleString("en-PK");
}

function formatPointTimestamp(timestamp: number, range: StockChartRange): string {
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

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  return parsed.toLocaleString("en-PK", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
        {label}
      </Text>
      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
        {value}
      </Text>
    </View>
  );
}

export default function StockDetailScreen() {
  const router = useRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchParams = useLocalSearchParams<{ symbol?: string | string[] }>();
  const normalizedSymbol = React.useMemo(() => {
    const rawSymbol = Array.isArray(searchParams.symbol)
      ? searchParams.symbol[0]
      : searchParams.symbol;
    return (rawSymbol ?? "").trim().toUpperCase();
  }, [searchParams.symbol]);

  const [symbolMeta, setSymbolMeta] = React.useState<PsxSymbol | null>(null);
  const [quote, setQuote] = React.useState<SymbolQuote>(() =>
    getSymbolQuoteFallback(normalizedSymbol)
  );
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [chartRange, setChartRange] = React.useState<StockChartRange>("1D");
  const [chartSeries, setChartSeries] = React.useState<StockChartSeries>(() =>
    getStockChartSeriesFallback("1D")
  );
  const [isChartLoading, setIsChartLoading] = React.useState(true);
  const [selectedChartPoint, setSelectedChartPoint] =
    React.useState<StockChartPoint | null>(null);
  const chartRequestIdRef = React.useRef(0);

  const hydrateSymbolMeta = React.useCallback(async () => {
    if (normalizedSymbol.length === 0) {
      setSymbolMeta(null);
      return;
    }

    const cachedSymbols = await getCachedSymbols();
    const cachedMatch =
      cachedSymbols.find((item) => item.symbol === normalizedSymbol) ?? null;
    if (cachedMatch) {
      setSymbolMeta(cachedMatch);
    }

    const latestSymbols = await getLatestSymbols();
    const latestMatch =
      latestSymbols.find((item) => item.symbol === normalizedSymbol) ?? null;
    if (latestMatch) {
      setSymbolMeta(latestMatch);
    }
  }, [normalizedSymbol]);

  const refreshQuote = React.useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setIsInitialLoading(true);
      }

      try {
        if (normalizedSymbol.length === 0) {
          setQuote(getSymbolQuoteFallback(""));
          return;
        }

        const cachedQuote = await getCachedSymbolQuote(normalizedSymbol);
        if (cachedQuote) {
          setQuote(cachedQuote);
        }

        const latestQuote = await getLatestSymbolQuote(normalizedSymbol);
        setQuote(latestQuote);
      } finally {
        if (showLoader) {
          setIsInitialLoading(false);
        }
      }
    },
    [normalizedSymbol]
  );

  const refreshChart = React.useCallback(
    async (range: StockChartRange, showLoader = false) => {
      const requestId = chartRequestIdRef.current + 1;
      chartRequestIdRef.current = requestId;

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
        if (requestId === chartRequestIdRef.current) {
          setChartSeries(cachedSeries);
        }

        const latestSeries = await getLatestStockChartSeries(normalizedSymbol, range);
        if (requestId === chartRequestIdRef.current) {
          setChartSeries(latestSeries);
        }
      } finally {
        if (showLoader && requestId === chartRequestIdRef.current) {
          setIsChartLoading(false);
        }
      }
    },
    [normalizedSymbol]
  );

  React.useEffect(() => {
    void hydrateSymbolMeta();
    void refreshQuote(true);
    const intervalId = setInterval(() => {
      void refreshQuote();
    }, STOCK_DETAIL_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [hydrateSymbolMeta, refreshQuote]);

  React.useEffect(() => {
    setSelectedChartPoint(null);
    void refreshChart(chartRange, true);
    const intervalId = setInterval(() => {
      void refreshChart(chartRange);
    }, STOCK_DETAIL_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [chartRange, refreshChart]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        hydrateSymbolMeta(),
        refreshQuote(),
        refreshChart(chartRange),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [chartRange, hydrateSymbolMeta, refreshChart, refreshQuote]);

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

  const chartLastPoint = chartSeries.points[chartSeries.points.length - 1] ?? null;
  const activePoint = selectedChartPoint ?? chartLastPoint;

  const headerTitle = normalizedSymbol.length > 0 ? normalizedSymbol : "Stock Detail";
  const companyName = symbolMeta?.name ?? "Unknown Company";
  const sectorName = symbolMeta?.sectorName ?? "UNKNOWN";

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
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.back()}
              className="rounded-xl border border-app-highlight px-3 py-2 dark:border-app-highlightDark"
            >
              <Text className="text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                Back
              </Text>
            </TouchableOpacity>

            <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
              {headerTitle}
            </Text>

            <View className="w-14" />
          </View>

          {isInitialLoading ? (
            <View className="items-center rounded-3xl bg-brand-white/95 p-6 shadow-sm dark:bg-brand-white/10">
              <ActivityIndicator
                size="small"
                color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
              />
              <Text className="mt-3 text-sm font-semibold text-app-text dark:text-app-textDark">
                Loading stock details...
              </Text>
            </View>
          ) : normalizedSymbol.length === 0 ? (
            <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
              <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
                Invalid symbol
              </Text>
              <Text className="mt-2 text-sm text-app-text dark:text-app-textDark">
                Please open this screen from the Stocks list.
              </Text>
            </View>
          ) : (
            <>
              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    {normalizedSymbol}
                  </Text>
                  {isShariahCompliantSymbol(normalizedSymbol) ? (
                    <ShariahChip compact />
                  ) : null}
                </View>
                <Text className="mt-1 text-xl font-extrabold text-app-text dark:text-app-textDark">
                  {companyName}
                </Text>
                <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
                  {sectorName}
                </Text>

                <Text className="mt-4 text-4xl font-extrabold text-app-text dark:text-app-textDark">
                  {formatPKRAmount(quote.lastPrice)}
                </Text>
                <Text
                  className={[
                    "mt-1 text-sm font-semibold",
                    getValueToneClassName(quote.change),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {`${formatPKRAmount(quote.change)} (${formatSignedPercentage(
                    quote.changePct
                  )})`}
                </Text>
              </View>

              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Performance
                  </Text>
                  <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                    {activePoint
                      ? formatPointTimestamp(activePoint.timestamp, chartRange)
                      : "--"}
                  </Text>
                </View>

                <Text className="mt-2 text-lg font-extrabold text-app-text dark:text-app-textDark">
                  {activePoint ? formatPKRAmount(activePoint.price) : "PKR 0"}
                </Text>

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

                <View className="mt-4">
                  {isChartLoading ? (
                    <View className="h-[170px] items-center justify-center rounded-2xl bg-brand-white/70 dark:bg-brand-white/5">
                      <ActivityIndicator
                        size="small"
                        color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
                      />
                    </View>
                  ) : (
                    <StockLineChart
                      points={chartSeries.points}
                      lineColor={chartLineColor}
                      gridColor={chartGridColor}
                      onPointSelected={setSelectedChartPoint}
                    />
                  )}
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Stats
                </Text>
                <View className="mt-3 gap-2">
                  <StatRow label="High" value={formatPKRAmount(quote.highPrice)} />
                  <StatRow label="Low" value={formatPKRAmount(quote.lowPrice)} />
                  <StatRow
                    label="Previous"
                    value={formatPKRAmount(quote.previousClose)}
                  />
                  <StatRow
                    label="Last Volume"
                    value={formatCompactVolume(quote.lastVolume)}
                  />
                  <StatRow
                    label="Updated"
                    value={formatUpdatedAt(quote.asOf)}
                  />
                </View>
              </View>

            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
