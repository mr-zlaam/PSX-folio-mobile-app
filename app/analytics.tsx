import StockLineChart from "@/components/charts/stock-line-chart";
import {
  AnalyticsAllocationItem,
  AnalyticsSnapshot,
  AnalyticsTrendRange,
  getCachedAnalyticsSnapshot,
  getLatestAnalyticsSnapshot,
  getTrendPointsForRange,
} from "@/src/features/analytics/analytics-data";
import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import { subscribeToTradeMutations } from "@/src/features/trade/trade-events";
import { APP_COLORS } from "@/src/theme/colors";
import { useFocusEffect, useRouter } from "expo-router";
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

const ANALYTICS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TREND_RANGE_OPTIONS: AnalyticsTrendRange[] = ["1M", "3M", "6M", "1Y", "ALL"];

type AllocationViewMode = "companies" | "sectors";

function formatSignedPkr(value: number): string {
  if (!Number.isFinite(value)) {
    return "PKR 0";
  }

  if (value > 0) {
    return `+${formatPKRAmount(value)}`;
  }

  if (value < 0) {
    return `-${formatPKRAmount(Math.abs(value))}`;
  }

  return formatPKRAmount(0);
}

function formatCompactDate(value: string | null): string {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  return parsed.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
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

function formatSignedTwoDecimals(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  if (value > 0) {
    return `+${Math.abs(value).toFixed(2)}`;
  }

  if (value < 0) {
    return `-${Math.abs(value).toFixed(2)}`;
  }

  return "0.00";
}

function getToneTextClassName(value: number): string {
  if (value > 0) {
    return "text-success-green";
  }

  if (value < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function RangeChip({
  label,
  selected,
  onPress,
}: {
  label: AnalyticsTrendRange;
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
          "text-[11px] font-bold uppercase tracking-wide",
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

function AllocationModeChip({
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
        "rounded-xl px-3 py-2",
        selected
          ? "bg-app-highlight dark:bg-app-highlightDark"
          : "bg-app-highlight/10 dark:bg-brand-white/10",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-xs font-bold uppercase tracking-wide",
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

function MetricTile({
  label,
  value,
  toneClassName = "text-app-text dark:text-app-textDark",
}: {
  label: string;
  value: string;
  toneClassName?: string;
}) {
  return (
    <View className="flex-1 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
        {label}
      </Text>
      <Text className={["mt-1 text-base font-extrabold", toneClassName].join(" ")}>
        {value}
      </Text>
    </View>
  );
}

function RiskTile({
  label,
  value,
  toneClassName,
}: {
  label: string;
  value: string;
  toneClassName: string;
}) {
  return (
    <View className="flex-1 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
        {label}
      </Text>
      <Text className={["mt-2 text-base font-extrabold", toneClassName].join(" ")}>
        {value}
      </Text>
    </View>
  );
}

function AllocationBar({
  item,
  barClassName,
}: {
  item: AnalyticsAllocationItem;
  barClassName: string;
}) {
  return (
    <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
          {item.label}
        </Text>
        <Text className="text-sm font-extrabold text-app-text dark:text-app-textDark">
          {item.sharePct.toFixed(1)}%
        </Text>
      </View>
      <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
        {formatPKRAmount(item.value)}
      </Text>
      <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-app-highlight/10 dark:bg-brand-white/10">
        <View
          className={["h-full rounded-full", barClassName].join(" ")}
          style={{
            width: `${Math.max(0, Math.min(100, item.sharePct))}%`,
          }}
        />
      </View>
    </View>
  );
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  const [snapshot, setSnapshot] = React.useState<AnalyticsSnapshot | null>(null);
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [trendRange, setTrendRange] = React.useState<AnalyticsTrendRange>("1M");
  const [allocationView, setAllocationView] =
    React.useState<AllocationViewMode>("companies");
  const [selectedPointValue, setSelectedPointValue] = React.useState<number | null>(null);

  const refreshAnalytics = React.useCallback(async () => {
    const cachedSnapshot = await getCachedAnalyticsSnapshot();
    setSnapshot(cachedSnapshot);

    const latestSnapshot = await getLatestAnalyticsSnapshot();
    setSnapshot(latestSnapshot);
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        await refreshAnalytics();
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();
    const intervalId = setInterval(() => {
      void refreshAnalytics();
    }, ANALYTICS_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [refreshAnalytics]);

  React.useEffect(() => {
    const unsubscribe = subscribeToTradeMutations(() => {
      void refreshAnalytics();
    });

    return unsubscribe;
  }, [refreshAnalytics]);

  useFocusEffect(
    React.useCallback(() => {
      void refreshAnalytics();
    }, [refreshAnalytics])
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshAnalytics();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshAnalytics]);

  const trendPoints = React.useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return getTrendPointsForRange(snapshot.trend, trendRange);
  }, [snapshot, trendRange]);

  const chartPoints = React.useMemo(
    () =>
      trendPoints.map((point) => ({
        timestamp: point.timestamp,
        price: point.value,
      })),
    [trendPoints]
  );

  const chartToneValue = React.useMemo(() => {
    if (chartPoints.length < 2) {
      return 0;
    }

    return chartPoints[chartPoints.length - 1].price - chartPoints[0].price;
  }, [chartPoints]);

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

  const chartLatestValue =
    selectedPointValue ??
    (chartPoints.length > 0 ? chartPoints[chartPoints.length - 1].price : 0);

  const allocationItems = React.useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const source =
      allocationView === "companies"
        ? snapshot.companyAllocation
        : snapshot.sectorAllocation;
    return source.slice(0, 5);
  }, [allocationView, snapshot]);

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
          paddingBottom: insets.bottom + 34,
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
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.back()}
              className="rounded-xl border border-app-highlight px-3 py-2 dark:border-app-highlightDark"
            >
              <Text className="text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                Back
              </Text>
            </TouchableOpacity>
            <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
              Analytics
            </Text>
            <View className="w-14" />
          </View>

          {isBootstrapping && !snapshot ? (
            <View className="items-center rounded-3xl bg-brand-white/95 p-6 shadow-sm dark:bg-brand-white/10">
              <ActivityIndicator
                size="small"
                color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
              />
              <Text className="mt-3 text-sm font-semibold text-app-text dark:text-app-textDark">
                Building analytics...
              </Text>
            </View>
          ) : !snapshot ? (
            <View className="rounded-3xl bg-brand-white/95 p-5 shadow-sm dark:bg-brand-white/10">
              <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
                Analytics unavailable
              </Text>
              <Text className="mt-2 text-sm text-app-text dark:text-app-textDark">
                Pull down to retry.
              </Text>
            </View>
          ) : (
            <>
              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Portfolio Pulse
                </Text>
                <Text className="mt-2 text-3xl font-extrabold text-app-text dark:text-app-textDark">
                  {formatPKRAmount(snapshot.overview.currentWorth)}
                </Text>
                <Text
                  className={[
                    "mt-1 text-sm font-bold",
                    getToneTextClassName(snapshot.overview.dayChange),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {`Today ${formatSignedPkr(snapshot.overview.dayChange)} (${formatSignedPercentage(
                    snapshot.overview.dayChangePct
                  )})`}
                </Text>

                <View className="mt-4 flex-row gap-2">
                  <MetricTile
                    label="Invested"
                    value={formatPKRAmount(snapshot.overview.invested)}
                  />
                  <MetricTile
                    label="Return"
                    value={formatSignedPercentage(snapshot.overview.returnPct)}
                    toneClassName={getToneTextClassName(snapshot.overview.returnPct)}
                  />
                </View>

                <View className="mt-2 flex-row gap-2">
                  <MetricTile
                    label="Free Cash"
                    value={formatPKRAmount(snapshot.overview.freeCash)}
                  />
                  <MetricTile
                    label="Dividends"
                    value={formatPKRAmount(snapshot.overview.totalDividends)}
                  />
                </View>

                <Text className="mt-3 text-[11px] font-semibold text-text-placeholderLight dark:text-text-placeholderDark">
                  Updated {formatUpdatedAt(snapshot.asOf)}
                </Text>
              </View>

              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Equity Trend
                  </Text>
                  <Text className="text-sm font-extrabold text-app-text dark:text-app-textDark">
                    {formatPKRAmount(chartLatestValue)}
                  </Text>
                </View>

                <View className="mt-3 flex-row flex-wrap gap-2">
                  {TREND_RANGE_OPTIONS.map((rangeOption) => (
                    <RangeChip
                      key={rangeOption}
                      label={rangeOption}
                      selected={trendRange === rangeOption}
                      onPress={() => setTrendRange(rangeOption)}
                    />
                  ))}
                </View>

                <View className="mt-4">
                  <StockLineChart
                    points={chartPoints}
                    lineColor={chartLineColor}
                    gridColor={chartGridColor}
                    emptyLabel="Not enough data for trend chart"
                    onPointSelected={(point) => setSelectedPointValue(point?.price ?? null)}
                  />
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Benchmark Snapshot
                </Text>
                <View className="mt-3 gap-2">
                  {[
                    snapshot.benchmark.kse100
                      ? {
                          code: "KSE100",
                          points: snapshot.benchmark.kse100.latestPrice,
                          change: snapshot.benchmark.kse100.change,
                          changePct: snapshot.benchmark.kse100.changePct,
                        }
                      : null,
                    snapshot.benchmark.kmi30
                      ? {
                          code: "KMI30",
                          points: snapshot.benchmark.kmi30.latestPrice,
                          change: snapshot.benchmark.kmi30.change,
                          changePct: snapshot.benchmark.kmi30.changePct,
                        }
                      : null,
                  ]
                    .filter((row): row is NonNullable<typeof row> => row !== null)
                    .map((row) => (
                      <View
                        key={row.code}
                        className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5"
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="text-sm font-extrabold text-app-text dark:text-app-textDark">
                            {row.code}
                          </Text>
                          <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                            {row.points.toLocaleString("en-PK", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </Text>
                        </View>
                        <Text
                          className={[
                            "mt-1 text-sm font-extrabold",
                            getToneTextClassName(row.change),
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {`${formatSignedTwoDecimals(row.change)} (${formatSignedPercentage(
                            row.changePct
                          )})`}
                        </Text>
                      </View>
                    ))}
                </View>
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1 rounded-3xl bg-brand-white px-4 py-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Best Performer
                  </Text>
                  <Text className="mt-2 text-2xl font-extrabold text-app-text dark:text-app-textDark">
                    {snapshot.bestPerformer?.symbol ?? "N/A"}
                  </Text>
                  <Text
                    className={[
                      "mt-1 text-sm font-bold",
                      getToneTextClassName(snapshot.bestPerformer?.returnPct ?? 0),
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {formatSignedPercentage(snapshot.bestPerformer?.returnPct ?? 0)}
                  </Text>
                </View>

                <View className="flex-1 rounded-3xl bg-brand-white px-4 py-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Weakest
                  </Text>
                  <Text className="mt-2 text-2xl font-extrabold text-app-text dark:text-app-textDark">
                    {snapshot.worstPerformer?.symbol ?? "N/A"}
                  </Text>
                  <Text
                    className={[
                      "mt-1 text-sm font-bold",
                      getToneTextClassName(snapshot.worstPerformer?.returnPct ?? 0),
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {formatSignedPercentage(snapshot.worstPerformer?.returnPct ?? 0)}
                  </Text>
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Risk Meter
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <RiskTile
                    label="Drawdown"
                    value={`${snapshot.risk.maxDrawdownPct.toFixed(2)}%`}
                    toneClassName="text-brand-red"
                  />
                  <RiskTile
                    label="Volatility"
                    value={`${snapshot.risk.volatilityPct.toFixed(2)}%`}
                    toneClassName="text-app-text dark:text-app-textDark"
                  />
                  <RiskTile
                    label="Best Day"
                    value={
                      snapshot.risk.bestDayDate
                        ? `${formatCompactDate(snapshot.risk.bestDayDate)} (${formatSignedPercentage(
                            snapshot.risk.bestDayPct
                          )})`
                        : "No gain day yet"
                    }
                    toneClassName={
                      snapshot.risk.bestDayDate
                        ? "text-success-green"
                        : "text-app-text dark:text-app-textDark"
                    }
                  />
                </View>
                <View className="mt-2 flex-row items-center justify-between rounded-2xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/5">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Worst Day
                  </Text>
                  <Text
                    className={[
                      "text-sm font-extrabold",
                      snapshot.risk.worstDayDate
                        ? "text-brand-red"
                        : "text-app-text dark:text-app-textDark",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {snapshot.risk.worstDayDate
                      ? `${formatCompactDate(snapshot.risk.worstDayDate)} (${formatSignedPercentage(
                          snapshot.risk.worstDayPct
                        )})`
                      : "No loss day yet"}
                  </Text>
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Allocation
                  </Text>
                  <View className="flex-row gap-2">
                    <AllocationModeChip
                      label="Companies"
                      selected={allocationView === "companies"}
                      onPress={() => setAllocationView("companies")}
                    />
                    <AllocationModeChip
                      label="Sectors"
                      selected={allocationView === "sectors"}
                      onPress={() => setAllocationView("sectors")}
                    />
                  </View>
                </View>

                <View className="mt-3 gap-2">
                  {allocationItems.length === 0 ? (
                    <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                      <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                        No allocation data yet.
                      </Text>
                    </View>
                  ) : (
                    allocationItems.map((item, index) => (
                      <AllocationBar
                        key={item.key}
                        item={item}
                        barClassName={
                          index % 2 === 0 ? "bg-app-highlight" : "bg-success-green"
                        }
                      />
                    ))
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
