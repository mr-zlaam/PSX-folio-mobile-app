import StockLineChart from "@/components/charts/stock-line-chart";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import {
  AppChartSkeleton,
  AppSkeletonBlock,
  AppSkeletonTextGroup,
} from "@/components/ui/app-skeleton";
import {
  AnalyticsAllocationItem,
  AnalyticsSnapshot,
  AnalyticsTrendRange,
  getAnalyticsRangeStartTimestamp,
  getCachedAnalyticsSnapshot,
  getLatestAnalyticsSnapshot,
  getTrendPointsForRange,
} from "@/src/features/analytics/analytics-data";
import {
  getMarketIndexDefinitions,
} from "@/src/features/market/market-data";
import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import AppBackgroundRefreshIndicator from "@/components/ui/app-background-refresh-indicator";
import { useBackgroundSyncIndicator } from "@/src/lib/use-background-sync-indicator";
import { subscribeToTradeMutations } from "@/src/features/trade/trade-events";
import {
  getCachedStockChartSeries,
  getLatestStockChartSeries,
  getStockChartSeriesFallback,
  StockChartPoint,
  StockChartRange,
  StockChartSeries,
} from "@/src/features/trade/stock-chart-data";
import { APP_COLORS } from "@/src/theme/colors";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useGuardedRouter } from "@/src/lib/navigation";
import { useColorScheme } from "nativewind";
import React from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const ANALYTICS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TREND_RANGE_OPTIONS: AnalyticsTrendRange[] = ["1M", "3M", "6M", "1Y", "ALL"];
const COMPARISON_PRIORITY_CODES = ["KSE100", "KMI30", "KSE30", "ALLSHR"] as const;

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

function mapAnalyticsRangeToStockRange(range: AnalyticsTrendRange): StockChartRange {
  if (range === "1M") {
    return "1M";
  }

  if (range === "3M" || range === "6M") {
    return "6M";
  }

  if (range === "1Y") {
    return "1Y";
  }

  return "5Y";
}

function sortPointsAscending(points: StockChartPoint[]): StockChartPoint[] {
  return [...points].sort((firstPoint, secondPoint) => firstPoint.timestamp - secondPoint.timestamp);
}

function filterStockPointsForAnalyticsRange(
  points: StockChartPoint[],
  range: AnalyticsTrendRange
): StockChartPoint[] {
  const startTimestamp = getAnalyticsRangeStartTimestamp(range);
  if (startTimestamp === null) {
    return points;
  }

  return points.filter((point) => point.timestamp >= startTimestamp);
}

function normalizePerformancePoints(points: StockChartPoint[]): StockChartPoint[] {
  if (points.length === 0) {
    return [];
  }

  const baselinePoint = points.find(
    (point) => Number.isFinite(point.price) && Math.abs(point.price) > 1e-8
  );
  const baseline = baselinePoint?.price ?? 0;
  if (!Number.isFinite(baseline) || Math.abs(baseline) <= 1e-8) {
    return points.map((point) => ({
      timestamp: point.timestamp,
      price: 0,
    }));
  }

  return points.map((point) => ({
    timestamp: point.timestamp,
    price: ((point.price - baseline) / baseline) * 100,
  }));
}

function normalizePortfolioGrowthFromInvested(
  points: StockChartPoint[],
  investedValue: number
): StockChartPoint[] {
  const safeInvestedValue = Number.isFinite(investedValue) ? investedValue : 0;
  if (points.length === 0 || safeInvestedValue <= 0) {
    return points.map((point) => ({
      timestamp: point.timestamp,
      price: 0,
    }));
  }

  return points.map((point) => ({
    timestamp: point.timestamp,
    price: ((point.price - safeInvestedValue) / safeInvestedValue) * 100,
  }));
}

function toSignedLogValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value === 0) {
    return 0;
  }

  const sign = value < 0 ? -1 : 1;
  return sign * Math.log1p(Math.abs(value));
}

function buildReadableComparisonChartPoints(points: StockChartPoint[]): StockChartPoint[] {
  return points.map((point) => ({
    timestamp: point.timestamp,
    price: toSignedLogValue(point.price),
  }));
}

function alignComparisonPointsToPortfolioTimeline(
  portfolioPoints: StockChartPoint[],
  comparisonPoints: StockChartPoint[]
): StockChartPoint[] {
  if (portfolioPoints.length === 0 || comparisonPoints.length === 0) {
    return [];
  }

  const sortedComparisonPoints = sortPointsAscending(comparisonPoints);
  if (sortedComparisonPoints.length === 1) {
    const singlePoint = sortedComparisonPoints[0];
    return portfolioPoints.map((portfolioPoint) => ({
      timestamp: portfolioPoint.timestamp,
      price: singlePoint.price,
    }));
  }

  return portfolioPoints.map((portfolioPoint) => {
    const timestamp = portfolioPoint.timestamp;
    const firstPoint = sortedComparisonPoints[0]!;
    const lastPoint = sortedComparisonPoints[sortedComparisonPoints.length - 1]!;

    if (timestamp <= firstPoint.timestamp) {
      return {
        timestamp,
        price: firstPoint.price,
      };
    }

    if (timestamp >= lastPoint.timestamp) {
      return {
        timestamp,
        price: lastPoint.price,
      };
    }

    let rightIndex = sortedComparisonPoints.findIndex(
      (point) => point.timestamp >= timestamp
    );

    if (rightIndex <= 0) {
      rightIndex = 1;
    }

    const leftPoint = sortedComparisonPoints[rightIndex - 1]!;
    const rightPoint = sortedComparisonPoints[rightIndex]!;
    const span = rightPoint.timestamp - leftPoint.timestamp;
    const ratio = span <= 0 ? 0 : (timestamp - leftPoint.timestamp) / span;
    const interpolatedPrice =
      leftPoint.price + (rightPoint.price - leftPoint.price) * ratio;

    return {
      timestamp,
      price: interpolatedPrice,
    };
  });
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

function AnalyticsScreenSkeleton({ minHeight }: { minHeight: number }) {
  return (
    <View className="gap-4" style={{ minHeight }}>
      <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
        <AppSkeletonBlock width="34%" height={12} borderRadius={7} />
        <AppSkeletonBlock className="mt-2" width="52%" height={32} borderRadius={10} />
        <AppSkeletonBlock className="mt-2" width="46%" height={12} borderRadius={7} />

        <View className="mt-4 flex-row gap-2">
          <View className="flex-1 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
            <AppSkeletonBlock width="40%" height={10} borderRadius={6} />
            <AppSkeletonBlock className="mt-2" width="72%" height={16} borderRadius={8} />
          </View>
          <View className="flex-1 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
            <AppSkeletonBlock width="42%" height={10} borderRadius={6} />
            <AppSkeletonBlock className="mt-2" width="68%" height={16} borderRadius={8} />
          </View>
        </View>

        <View className="mt-2 flex-row gap-2">
          <View className="flex-1 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
            <AppSkeletonBlock width="34%" height={10} borderRadius={6} />
            <AppSkeletonBlock className="mt-2" width="66%" height={16} borderRadius={8} />
          </View>
          <View className="flex-1 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
            <AppSkeletonBlock width="46%" height={10} borderRadius={6} />
            <AppSkeletonBlock className="mt-2" width="70%" height={16} borderRadius={8} />
          </View>
        </View>
      </View>

      <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
        <View className="flex-row items-center justify-between">
          <AppSkeletonBlock width={120} height={12} borderRadius={7} />
          <AppSkeletonBlock width={92} height={14} borderRadius={8} />
        </View>
        <View className="mt-3 flex-row gap-2">
          <AppSkeletonBlock width={44} height={30} borderRadius={10} />
          <AppSkeletonBlock width={44} height={30} borderRadius={10} />
          <AppSkeletonBlock width={44} height={30} borderRadius={10} />
          <AppSkeletonBlock width={44} height={30} borderRadius={10} />
          <AppSkeletonBlock width={44} height={30} borderRadius={10} />
        </View>
        <View className="mt-4">
          <AppChartSkeleton height={170} />
        </View>
      </View>

      <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
        <AppSkeletonTextGroup rows={4} rowHeight={12} />
      </View>
    </View>
  );
}

export default function AnalyticsScreen() {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  const [snapshot, setSnapshot] = React.useState<AnalyticsSnapshot | null>(null);
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [trendRange, setTrendRange] = React.useState<AnalyticsTrendRange>("1M");
  const [comparisonIndexCode, setComparisonIndexCode] = React.useState<string>("KSE100");
  const [comparisonSeries, setComparisonSeries] = React.useState<StockChartSeries>(() =>
    getStockChartSeriesFallback(mapAnalyticsRangeToStockRange("1M"))
  );
  const [allocationView, setAllocationView] =
    React.useState<AllocationViewMode>("companies");
  const [selectedComparisonPointTimestamp, setSelectedComparisonPointTimestamp] =
    React.useState<number | null>(null);
  const comparisonSheetRef = React.useRef<BottomSheetModal>(null);
  const comparisonSheetSnapPoints = React.useMemo(() => ["56%", "84%"], []);
  const refreshRequestIdRef = React.useRef(0);
  const {
    isBackgroundSyncing,
    beginBackgroundSync,
    endBackgroundSync,
  } = useBackgroundSyncIndicator();

  const comparisonIndexOptions = React.useMemo(() => {
    const allDefinitions = getMarketIndexDefinitions();
    const definitionsByCode = new Map(
      allDefinitions.map((definition) => [definition.code, definition])
    );
    const prioritizedCodes = COMPARISON_PRIORITY_CODES.filter((code) =>
      definitionsByCode.has(code)
    );
    const remainingCodes = allDefinitions
      .map((definition) => definition.code)
      .filter((code) => !prioritizedCodes.includes(code as (typeof COMPARISON_PRIORITY_CODES)[number]));
    const orderedCodes = [...prioritizedCodes, ...remainingCodes];

    return orderedCodes.map((code) => {
      const definition = definitionsByCode.get(code);
      return {
        code,
        label: definition?.displayCode ?? code,
        name: definition?.name ?? code,
      };
    });
  }, []);

  const selectedComparisonIndexLabel =
    comparisonIndexOptions.find((option) => option.code === comparisonIndexCode)?.label ??
    comparisonIndexCode;
  const comparisonLineColor = APP_COLORS.accent.indexLine;

  React.useEffect(() => {
    if (comparisonIndexOptions.length === 0) {
      return;
    }

    const hasSelectedOption = comparisonIndexOptions.some(
      (option) => option.code === comparisonIndexCode
    );
    if (hasSelectedOption) {
      return;
    }

    const fallbackOption = comparisonIndexOptions[0];
    if (fallbackOption) {
      setComparisonIndexCode(fallbackOption.code);
    }
  }, [comparisonIndexCode, comparisonIndexOptions]);

  const openComparisonSheet = React.useCallback(() => {
    comparisonSheetRef.current?.present();
  }, []);

  const closeComparisonSheet = React.useCallback(() => {
    comparisonSheetRef.current?.dismiss();
  }, []);

  const comparisonSheetBackdrop = React.useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  const refreshAnalytics = React.useCallback(async (options?: {
    showBackgroundSync?: boolean;
    forceLive?: boolean;
  }) => {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    const showBackgroundSync = options?.showBackgroundSync ?? true;
    const forceLive = options?.forceLive ?? false;
    const stockRange = mapAnalyticsRangeToStockRange(trendRange);
    let didStartBackgroundSync = false;

    try {
      const [cachedSnapshot, cachedComparison] = await Promise.all([
        getCachedAnalyticsSnapshot(),
        getCachedStockChartSeries(comparisonIndexCode, stockRange),
      ]);

      if (requestId !== refreshRequestIdRef.current) {
        return;
      }

      const cachedComparisonForRange = filterStockPointsForAnalyticsRange(
        cachedComparison.points,
        trendRange
      );
      setSnapshot(cachedSnapshot);
      setComparisonSeries(
        cachedComparison.points.length > 0
          ? cachedComparison
          : getStockChartSeriesFallback(stockRange)
      );

      const hasVisibleCachedData =
        cachedSnapshot.trend.length > 1 || cachedComparisonForRange.length > 1;
      if (isBootstrapping && hasVisibleCachedData) {
        setIsBootstrapping(false);
      }

      if (showBackgroundSync && hasVisibleCachedData) {
        beginBackgroundSync();
        didStartBackgroundSync = true;
      }

      const [latestSnapshot, latestComparison] = await Promise.all([
        getLatestAnalyticsSnapshot(),
        getLatestStockChartSeries(comparisonIndexCode, stockRange, {
          forceLive,
        }),
      ]);

      if (requestId !== refreshRequestIdRef.current) {
        return;
      }

      setSnapshot(latestSnapshot);
      setComparisonSeries(
        latestComparison.points.length > 0
          ? latestComparison
          : getStockChartSeriesFallback(stockRange)
      );
    } finally {
      if (didStartBackgroundSync) {
        endBackgroundSync();
      }

      if (requestId === refreshRequestIdRef.current && isBootstrapping) {
        setIsBootstrapping(false);
      }
    }
  }, [
    beginBackgroundSync,
    comparisonIndexCode,
    endBackgroundSync,
    isBootstrapping,
    trendRange,
  ]);

  React.useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      await refreshAnalytics({
        showBackgroundSync: false,
      });
      if (isMounted) {
        setIsBootstrapping(false);
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
      await refreshAnalytics({
        showBackgroundSync: false,
        forceLive: true,
      });
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

  const chartGridColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;

  const comparisonSourcePoints = React.useMemo(
    () =>
      filterStockPointsForAnalyticsRange(
        sortPointsAscending(comparisonSeries.points),
        trendRange
      ),
    [comparisonSeries.points, trendRange]
  );

  const comparisonTimelinePoints = React.useMemo(() => {
    if (comparisonSourcePoints.length >= chartPoints.length) {
      return comparisonSourcePoints;
    }

    return chartPoints;
  }, [chartPoints, comparisonSourcePoints]);

  const alignedPortfolioRawPoints = React.useMemo(
    () => alignComparisonPointsToPortfolioTimeline(comparisonTimelinePoints, chartPoints),
    [chartPoints, comparisonTimelinePoints]
  );

  const alignedIndexRawPoints = React.useMemo(
    () => alignComparisonPointsToPortfolioTimeline(
      comparisonTimelinePoints,
      comparisonSourcePoints
    ),
    [comparisonSourcePoints, comparisonTimelinePoints]
  );

  const indexComparisonPoints = React.useMemo(
    () => normalizePerformancePoints(alignedIndexRawPoints),
    [alignedIndexRawPoints]
  );

  const portfolioComparisonPoints = React.useMemo(
    () =>
      normalizePortfolioGrowthFromInvested(
        alignedPortfolioRawPoints,
        snapshot?.overview.invested ?? 0
      ),
    [alignedPortfolioRawPoints, snapshot?.overview.invested]
  );

  const portfolioComparisonChartPoints = React.useMemo(
    () => buildReadableComparisonChartPoints(portfolioComparisonPoints),
    [portfolioComparisonPoints]
  );

  const indexComparisonChartPoints = React.useMemo(
    () => buildReadableComparisonChartPoints(indexComparisonPoints),
    [indexComparisonPoints]
  );

  const indexComparisonPointsByTimestamp = React.useMemo(
    () =>
      new Map(
        indexComparisonPoints.map((point) => [point.timestamp, point.price] as const)
      ),
    [indexComparisonPoints]
  );

  const selectedPortfolioComparisonValue =
    selectedComparisonPointTimestamp === null
      ? portfolioComparisonPoints[portfolioComparisonPoints.length - 1]?.price ?? 0
      : portfolioComparisonPoints.find(
          (point) => point.timestamp === selectedComparisonPointTimestamp
        )?.price ?? 0;

  const selectedIndexComparisonValue =
    selectedComparisonPointTimestamp === null
      ? indexComparisonPoints[indexComparisonPoints.length - 1]?.price ?? 0
      : indexComparisonPointsByTimestamp.get(selectedComparisonPointTimestamp) ?? 0;

  React.useEffect(() => {
    setSelectedComparisonPointTimestamp(null);
  }, [comparisonIndexCode, trendRange, snapshot?.asOf]);

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

  const analyticsSkeletonMinHeight = React.useMemo(
    () => Math.max(windowHeight - insets.bottom - 120, 700),
    [insets.bottom, windowHeight]
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
            <AppBackIconButton onPress={() => router.back()} />
            <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
              Analytics
            </Text>
            <View className="w-14" />
          </View>

          {isBootstrapping && !snapshot ? (
            <AnalyticsScreenSkeleton minHeight={analyticsSkeletonMinHeight} />
          ) : !snapshot ? (
            <View className="rounded-3xl bg-brand-white/95 p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
              <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
                Analytics unavailable
              </Text>
              <Text className="mt-2 text-sm text-app-text dark:text-app-textDark">
                Pull down to retry.
              </Text>
            </View>
          ) : (
            <>
              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
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
                  {`Session ${formatSignedPkr(snapshot.overview.dayChange)} (${formatSignedPercentage(
                    snapshot.overview.dayChangePct
                  )})`}
                </Text>

                <View className="mt-4 flex-row gap-2">
                  <MetricTile
                    label="Invested"
                    value={formatPKRAmount(snapshot.overview.invested)}
                  />
                  <MetricTile
                    label="Total P/L"
                    value={formatSignedPkr(snapshot.overview.profit)}
                    toneClassName={getToneTextClassName(snapshot.overview.profit)}
                  />
                </View>

                <View className="mt-2 flex-row gap-2">
                  <MetricTile
                    label="Return"
                    value={formatSignedPercentage(snapshot.overview.returnPct)}
                    toneClassName={getToneTextClassName(snapshot.overview.returnPct)}
                  />
                  <MetricTile
                    label="Realized P/L"
                    value={formatSignedPkr(snapshot.overview.realizedProfit)}
                    toneClassName={getToneTextClassName(snapshot.overview.realizedProfit)}
                  />
                </View>

                <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                  {`Dividends ${formatPKRAmount(snapshot.overview.totalDividends)}`}
                </Text>

                <View className="mt-3 flex-row items-center justify-between gap-3">
                  <Text className="text-[11px] font-semibold text-text-placeholderLight dark:text-text-placeholderDark">
                    Updated {formatUpdatedAt(snapshot.asOf)}
                  </Text>
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Portfolio vs Index
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={openComparisonSheet}
                    className={[
                      "flex-row items-center gap-1.5 rounded-2xl px-3.5 py-2.5",
                      isDarkMode
                        ? "bg-brand-white shadow-sm shadow-brand-white/15"
                        : "bg-app-highlight shadow-sm shadow-app-highlight/25",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Text
                      className={[
                        "text-xs font-extrabold uppercase tracking-wide",
                        isDarkMode ? "text-app-highlight" : "text-brand-white",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {selectedComparisonIndexLabel}
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-down"
                      size={16}
                      color={isDarkMode ? APP_COLORS.brand.purple : APP_COLORS.brand.white}
                    />
                  </TouchableOpacity>
                </View>

                <View className="mt-3 flex-row items-center gap-4">
                  <View className="flex-row items-center gap-2">
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: APP_COLORS.success.green }}
                    />
                    <Text className="text-[11px] font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Portfolio
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: comparisonLineColor }}
                    />
                    <Text className="text-[11px] font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      {selectedComparisonIndexLabel}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row gap-2">
                  <View className="flex-1 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Portfolio
                    </Text>
                    <Text
                      className={[
                        "mt-1 text-base font-extrabold",
                        getToneTextClassName(selectedPortfolioComparisonValue),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {formatSignedPercentage(selectedPortfolioComparisonValue)}
                    </Text>
                  </View>
                  <View className="flex-1 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      {selectedComparisonIndexLabel}
                    </Text>
                    <Text
                      className={[
                        "mt-1 text-base font-extrabold",
                        getToneTextClassName(selectedIndexComparisonValue),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {formatSignedPercentage(selectedIndexComparisonValue)}
                    </Text>
                  </View>
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

                <View className="mt-2 flex-row items-center justify-end">
                  <AppBackgroundRefreshIndicator
                    visible={isBackgroundSyncing}
                    label="Refreshing"
                  />
                </View>

                <View
                  className="mt-4"
                  style={{ opacity: isBackgroundSyncing ? 0.72 : 1 }}
                >
                  <StockLineChart
                    points={portfolioComparisonChartPoints}
                    secondaryPoints={indexComparisonChartPoints}
                    lineColor={APP_COLORS.success.green}
                    secondaryLineColor={comparisonLineColor}
                    gridColor={chartGridColor}
                    emptyLabel="Not enough data for comparison chart"
                    height={206}
                    interactive
                    curved
                    showHorizontalGuide={false}
                    showSelectedSecondaryMarker
                    onPointSelected={(point) =>
                      setSelectedComparisonPointTimestamp(point?.timestamp ?? null)
                    }
                  />
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
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
                <View className="flex-1 rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Best Performer
                  </Text>
                  <Text className="mt-2 text-2xl font-extrabold text-app-text dark:text-app-textDark">
                    {snapshot.bestPerformer?.symbol ?? "N/A"}
                  </Text>
                  <Text
                    className={[
                      "mt-1 text-sm font-bold",
                      getToneTextClassName(snapshot.bestPerformer?.impactPkr ?? 0),
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {formatSignedPkr(snapshot.bestPerformer?.impactPkr ?? 0)}
                  </Text>
                  <Text className="mt-1 text-[11px] font-semibold text-app-text dark:text-app-textDark">
                    {`${formatSignedPercentage(
                      snapshot.bestPerformer?.impactPct ?? 0
                    )} impact • ${(snapshot.bestPerformer?.weightPct ?? 0).toFixed(
                      1
                    )}% weight`}
                  </Text>
                  <Text className="mt-1 text-[11px] font-semibold text-app-text dark:text-app-textDark">
                    {`Return ${formatSignedPercentage(
                      snapshot.bestPerformer?.returnPct ?? 0
                    )}`}
                  </Text>
                </View>

                <View className="flex-1 rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Weakest
                  </Text>
                  <Text className="mt-2 text-2xl font-extrabold text-app-text dark:text-app-textDark">
                    {snapshot.worstPerformer?.symbol ?? "N/A"}
                  </Text>
                  <Text
                    className={[
                      "mt-1 text-sm font-bold",
                      getToneTextClassName(snapshot.worstPerformer?.impactPkr ?? 0),
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {formatSignedPkr(snapshot.worstPerformer?.impactPkr ?? 0)}
                  </Text>
                  <Text className="mt-1 text-[11px] font-semibold text-app-text dark:text-app-textDark">
                    {`${formatSignedPercentage(
                      snapshot.worstPerformer?.impactPct ?? 0
                    )} impact • ${(snapshot.worstPerformer?.weightPct ?? 0).toFixed(
                      1
                    )}% weight`}
                  </Text>
                  <Text className="mt-1 text-[11px] font-semibold text-app-text dark:text-app-textDark">
                    {`Return ${formatSignedPercentage(
                      snapshot.worstPerformer?.returnPct ?? 0
                    )}`}
                  </Text>
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
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

              <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
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

      <BottomSheetModal
        ref={comparisonSheetRef}
        snapPoints={comparisonSheetSnapPoints}
        enablePanDownToClose
        backdropComponent={comparisonSheetBackdrop}
        backgroundStyle={{
          backgroundColor: isDarkMode ? APP_COLORS.brand.purple : APP_COLORS.brand.white,
        }}
        handleIndicatorStyle={{
          backgroundColor: isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple,
        }}
      >
        <BottomSheetView
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <Text className="text-center text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
            Compare With Index
          </Text>
          <Text className="mt-1 text-center text-xs font-semibold text-text-placeholderLight dark:text-text-placeholderDark">
            Select one benchmark index
          </Text>

          <View className="mt-3 max-h-[420px] overflow-hidden rounded-2xl bg-brand-white/95 shadow-sm shadow-app-highlight/10 dark:bg-brand-white/5 dark:shadow-black/25">
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="pb-1">
                {comparisonIndexOptions.map((indexOption, optionIndex) => {
                  const selected = comparisonIndexCode === indexOption.code;
                  return (
                    <TouchableOpacity
                      key={indexOption.code}
                      activeOpacity={0.88}
                      onPress={() => {
                        setComparisonIndexCode(indexOption.code);
                        closeComparisonSheet();
                      }}
                      className={[
                        "relative flex-row items-center justify-between px-4 py-3.5",
                        selected
                          ? "bg-app-highlight/10 dark:bg-brand-white/10"
                          : "bg-transparent",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <View className="flex-1 pr-3">
                        <Text
                          className={[
                            "text-sm font-extrabold",
                            selected
                              ? "text-app-highlight dark:text-app-highlightDark"
                              : "text-app-text dark:text-app-textDark",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {indexOption.label}
                        </Text>
                        <Text className="mt-0.5 text-xs font-semibold text-text-placeholderLight dark:text-text-placeholderDark">
                          {indexOption.name}
                        </Text>
                      </View>
                      {selected ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={18}
                          color={
                            isDarkMode
                              ? APP_COLORS.brand.white
                              : APP_COLORS.brand.purple
                          }
                        />
                      ) : null}
                      {optionIndex < comparisonIndexOptions.length - 1 ? (
                        <View className="absolute bottom-0 left-4 right-4 h-px bg-app-highlight/10 dark:bg-brand-white/10" />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
