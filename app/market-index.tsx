import StockLineChart from "@/components/charts/stock-line-chart";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import {
  getCachedMarketIndexDetail,
  getLatestMarketIndexDetail,
  getMarketIndexDefinitionByCode,
  MarketIndexDetailSnapshot,
} from "@/src/features/market/market-data";
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

const MARKET_DETAIL_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
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

function formatPoints(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactMetric(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}T`;
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

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(minValue, value));
}

function getRangeMarkerPositionPct(
  lowValue: number,
  highValue: number,
  currentValue: number
): number {
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || highValue <= lowValue) {
    return 50;
  }

  const ratio = (currentValue - lowValue) / (highValue - lowValue);
  return clamp(ratio * 100, 0, 100);
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

function RangeBar({
  lowValue,
  highValue,
  currentValue,
  markerToneClassName,
}: {
  lowValue: number;
  highValue: number;
  currentValue: number;
  markerToneClassName: string;
}) {
  const markerPositionPct = getRangeMarkerPositionPct(
    lowValue,
    highValue,
    currentValue
  );

  return (
    <View className="mt-2">
      <View className="relative h-5 justify-center">
        <View className="h-1 rounded-full bg-app-highlight/30 dark:bg-brand-white/30" />
        <View
          className={[
            "absolute h-4 w-4 rounded-full border border-brand-white",
            markerToneClassName,
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            left: `${markerPositionPct}%`,
            marginLeft: -8,
          }}
        />
      </View>
    </View>
  );
}

export default function MarketIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchParams = useLocalSearchParams<{ code?: string | string[] }>();
  const normalizedCode = React.useMemo(() => {
    const rawCode = Array.isArray(searchParams.code)
      ? searchParams.code[0]
      : searchParams.code;
    return (rawCode ?? "").trim().toUpperCase();
  }, [searchParams.code]);
  const indexDefinition = React.useMemo(
    () => getMarketIndexDefinitionByCode(normalizedCode),
    [normalizedCode]
  );

  const [detail, setDetail] = React.useState<MarketIndexDetailSnapshot | null>(null);
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

  const refreshDetail = React.useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setIsInitialLoading(true);
      }

      try {
        if (normalizedCode.length === 0) {
          setDetail(null);
          return;
        }

        const cachedDetail = await getCachedMarketIndexDetail(normalizedCode);
        if (cachedDetail) {
          setDetail(cachedDetail);
        }

        const latestDetail = await getLatestMarketIndexDetail(normalizedCode);
        if (latestDetail) {
          setDetail(latestDetail);
        }
      } finally {
        if (showLoader) {
          setIsInitialLoading(false);
        }
      }
    },
    [normalizedCode]
  );

  const refreshChart = React.useCallback(
    async (range: StockChartRange, showLoader = false) => {
      const requestId = chartRequestIdRef.current + 1;
      chartRequestIdRef.current = requestId;

      if (showLoader) {
        setIsChartLoading(true);
      }

      try {
        if (normalizedCode.length === 0) {
          if (requestId === chartRequestIdRef.current) {
            setChartSeries(getStockChartSeriesFallback(range));
          }
          return;
        }

        const cachedSeries = await getCachedStockChartSeries(normalizedCode, range);
        if (requestId === chartRequestIdRef.current) {
          setChartSeries(cachedSeries);
        }

        const latestSeries = await getLatestStockChartSeries(normalizedCode, range);
        if (requestId === chartRequestIdRef.current) {
          setChartSeries(latestSeries);
        }
      } finally {
        if (showLoader && requestId === chartRequestIdRef.current) {
          setIsChartLoading(false);
        }
      }
    },
    [normalizedCode]
  );

  React.useEffect(() => {
    void refreshDetail(true);
    const intervalId = setInterval(() => {
      void refreshDetail();
    }, MARKET_DETAIL_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshDetail]);

  React.useEffect(() => {
    setSelectedChartPoint(null);
    void refreshChart(chartRange, true);
    const intervalId = setInterval(() => {
      void refreshChart(chartRange);
    }, MARKET_DETAIL_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [chartRange, refreshChart]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshDetail(), refreshChart(chartRange)]);
    } finally {
      setIsRefreshing(false);
    }
  }, [chartRange, refreshChart, refreshDetail]);

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
  const titleText =
    (detail?.snapshot.name ?? indexDefinition?.name ?? normalizedCode) ||
    "Market Index";
  const detailDisplayCode =
    detail?.snapshot.displayCode ?? indexDefinition?.displayCode ?? normalizedCode;
  const handleChartPointSelected = React.useCallback(
    (point: StockChartPoint | null) => {
      setSelectedChartPoint((previousPoint) => {
        if (previousPoint === point) {
          return previousPoint;
        }

        if (
          previousPoint &&
          point &&
          previousPoint.timestamp === point.timestamp &&
          previousPoint.price === point.price
        ) {
          return previousPoint;
        }

        return point;
      });
    },
    []
  );
  const handleOpenConstituents = React.useCallback(() => {
    if (normalizedCode.length === 0) {
      return;
    }

    router.push({
      pathname: "/market-index-stocks",
      params: {
        code: normalizedCode,
      },
    });
  }, [normalizedCode, router]);

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

            <Text className="max-w-[66%] text-center text-2xl font-extrabold text-app-text dark:text-app-textDark">
              {titleText}
            </Text>

            <View className="w-14" />
          </View>

          {isInitialLoading ? (
            <View className="items-center rounded-2xl bg-brand-white p-6 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <ActivityIndicator
                size="small"
                color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
              />
              <Text className="mt-3 text-sm font-semibold text-app-text dark:text-app-textDark">
                Loading index details...
              </Text>
            </View>
          ) : !detail ? (
            <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
                Index not found
              </Text>
              <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                Could not load details for this market index.
              </Text>
            </View>
          ) : (
            <>
              <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  {detail.snapshot.displayCode}
                </Text>
                <Text className="mt-2 text-4xl font-extrabold text-app-text dark:text-app-textDark">
                  {formatPoints(detail.snapshot.latestPrice)}
                </Text>
                <Text
                  className={[
                    "mt-1 text-xl font-extrabold",
                    getValueToneClassName(detail.snapshot.change),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {`${detail.snapshot.change > 0 ? "+" : ""}${formatPoints(
                    detail.snapshot.change
                  )} (${formatSignedPercentage(detail.snapshot.changePct)})`}
                </Text>
                <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                  {formatUpdatedAt(detail.snapshot.asOf)}
                </Text>
              </View>

              <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Performance
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
                    <View className="items-center justify-center rounded-2xl bg-brand-white/70 p-6 dark:bg-brand-white/5">
                      <ActivityIndicator
                        size="small"
                        color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
                      />
                      <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                        Loading chart...
                      </Text>
                    </View>
                  ) : (
                    <StockLineChart
                      points={chartSeries.points}
                      lineColor={chartLineColor}
                      gridColor={chartGridColor}
                      emptyLabel="No chart data for this range"
                      onPointSelected={handleChartPointSelected}
                    />
                  )}
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

                {chartFirstPoint && chartLastPoint ? (
                  <View className="mt-3 gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Start
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPoints(chartFirstPoint.price)}
                      </Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Latest
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPoints(chartLastPoint.price)}
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

              <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Index Stats
                </Text>

                <View className="mt-3 flex-row flex-wrap">
                  <View className="w-1/2 py-1 pr-2">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Volume
                    </Text>
                    <Text className="mt-1 text-lg font-extrabold text-app-text dark:text-app-textDark">
                      {formatCompactMetric(detail.volume)}
                    </Text>
                  </View>
                  <View className="w-1/2 py-1 pl-2">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Value Traded
                    </Text>
                    <Text className="mt-1 text-lg font-extrabold text-app-text dark:text-app-textDark">
                      {formatCompactMetric(detail.valueTraded)}
                    </Text>
                  </View>
                  <View className="w-1/2 py-1 pr-2">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Open
                    </Text>
                    <Text className="mt-1 text-lg font-extrabold text-app-text dark:text-app-textDark">
                      {formatPoints(detail.openPrice)}
                    </Text>
                  </View>
                  <View className="w-1/2 py-1 pl-2">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Last Day
                    </Text>
                    <Text className="mt-1 text-lg font-extrabold text-app-text dark:text-app-textDark">
                      {formatPoints(detail.lastDayClose)}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Day&apos;s Range
                </Text>
                <View className="mt-3 flex-row items-center justify-between">
                  <View>
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Day Low
                    </Text>
                    <Text className="mt-1 text-xl font-extrabold text-app-text dark:text-app-textDark">
                      {formatPoints(detail.dayLow)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Day High
                    </Text>
                    <Text className="mt-1 text-xl font-extrabold text-app-text dark:text-app-textDark">
                      {formatPoints(detail.dayHigh)}
                    </Text>
                  </View>
                </View>
                <RangeBar
                  lowValue={detail.dayLow}
                  highValue={detail.dayHigh}
                  currentValue={detail.snapshot.latestPrice}
                  markerToneClassName="bg-success-green"
                />
                <Text className="mt-2 text-xs font-semibold text-app-text dark:text-app-textDark">
                  Current: {formatPoints(detail.snapshot.latestPrice)}
                </Text>
              </View>

              <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  52-Week Range
                </Text>
                <View className="mt-3 flex-row items-center justify-between">
                  <View>
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      52-Week Low
                    </Text>
                    <Text className="mt-1 text-xl font-extrabold text-app-text dark:text-app-textDark">
                      {formatPoints(detail.week52Low)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      52-Week High
                    </Text>
                    <Text className="mt-1 text-xl font-extrabold text-app-text dark:text-app-textDark">
                      {formatPoints(detail.week52High)}
                    </Text>
                  </View>
                </View>
                <RangeBar
                  lowValue={detail.week52Low}
                  highValue={detail.week52High}
                  currentValue={detail.snapshot.latestPrice}
                  markerToneClassName="bg-app-highlight dark:bg-app-highlightDark"
                />
                <Text className="mt-2 text-xs font-semibold text-app-text dark:text-app-textDark">
                  Current: {formatPoints(detail.snapshot.latestPrice)}
                </Text>
              </View>

              <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Constituents
                </Text>
                <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                  Open a dedicated stock list for {detailDisplayCode} to browse and
                  search all companies smoothly.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handleOpenConstituents}
                  className="mt-4 rounded-xl border border-app-highlight/25 bg-app-highlight/5 px-4 py-3 dark:border-app-highlightDark/35 dark:bg-brand-white/5"
                >
                  <Text className="text-center text-sm font-bold text-app-highlight dark:text-app-highlightDark">
                    View {detailDisplayCode} Stocks
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
