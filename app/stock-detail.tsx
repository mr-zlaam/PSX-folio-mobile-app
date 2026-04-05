import StockLineChart from "@/components/charts/stock-line-chart";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import {
  AppChartSkeleton,
  AppSkeletonTextGroup,
} from "@/components/ui/app-skeleton";
import ShariahChip from "@/components/ui/shariah-chip";
import {
  CompanyDetailAnnouncement,
  CompanyDetailMatrixTable,
  CompanyDetailMetric,
  CompanyDetailSnapshot,
  getCachedCompanyDetail,
  getLatestCompanyDetail,
} from "@/src/features/company/company-detail-data";
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
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/src/lib/navigation";
import { useColorScheme } from "nativewind";
import React from "react";
import {
  Linking,
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

const COMPANY_DETAIL_ALLOWED_ORIGINS = new Set(["market", "watchlist", "stocks"]);
const COMPANY_DETAIL_TAB_KEYS = [
  "profile",
  "equity",
  "financials",
  "ratios",
  "announcements",
] as const;

type CompanyDetailTabKey = (typeof COMPANY_DETAIL_TAB_KEYS)[number];

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

function extractUrlFromText(value: string): string | null {
  const httpMatch = value.match(/https?:\/\/[^\s)]+/i);
  if (httpMatch && httpMatch[0]) {
    return httpMatch[0];
  }

  const wwwMatch = value.match(/www\.[^\s)]+/i);
  if (wwwMatch && wwwMatch[0]) {
    return `https://${wwwMatch[0]}`;
  }

  return null;
}

function normalizeExternalUrl(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim();
  if (trimmedUrl.length === 0) {
    return trimmedUrl;
  }

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("//")) {
    return `https:${trimmedUrl}`;
  }

  return `https://${trimmedUrl}`;
}

function parseNumericMetricValue(value: string): number | null {
  if (value.includes("%")) {
    return null;
  }

  const normalizedValue = value
    .replace(/,/g, "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  const numberMatch = normalizedValue.match(/(\(?-?\d+(?:\.\d+)?\)?)(?:\s*([kmbt]))?/i);
  if (!numberMatch || !numberMatch[1]) {
    return null;
  }

  const rawNumber = numberMatch[1];
  const negativeByParentheses =
    rawNumber.startsWith("(") && rawNumber.endsWith(")");
  const parsedNumber = Number.parseFloat(rawNumber.replace(/[()]/g, ""));
  if (!Number.isFinite(parsedNumber)) {
    return null;
  }

  let scaledValue = parsedNumber;
  const scaleToken = (numberMatch[2] ?? "").toUpperCase();
  if (scaleToken === "K") {
    scaledValue *= 1_000;
  } else if (scaleToken === "M") {
    scaledValue *= 1_000_000;
  } else if (scaleToken === "B") {
    scaledValue *= 1_000_000_000;
  } else if (scaleToken === "T") {
    scaledValue *= 1_000_000_000_000;
  }

  return negativeByParentheses ? -Math.abs(scaledValue) : scaledValue;
}

function parseEmbeddedPercentage(value: string): number | null {
  const percentageMatch = value.match(/-?\d+(?:\.\d+)?\s*%/);
  if (!percentageMatch || !percentageMatch[0]) {
    return null;
  }

  const parsedPercentage = Number.parseFloat(percentageMatch[0].replace("%", "").trim());
  return Number.isFinite(parsedPercentage) ? parsedPercentage : null;
}

function formatMetricPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00%";
  }

  const absoluteValue = Math.abs(value).toFixed(2);
  if (value > 0) {
    return `+${absoluteValue}%`;
  }

  if (value < 0) {
    return `-${absoluteValue}%`;
  }

  return "0.00%";
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

function getCompanyDetailTabLabel(tabKey: CompanyDetailTabKey): string {
  if (tabKey === "profile") {
    return "Profile";
  }

  if (tabKey === "equity") {
    return "Equity";
  }

  if (tabKey === "financials") {
    return "Financials";
  }

  if (tabKey === "ratios") {
    return "Ratios";
  }

  return "Announcements";
}

function CompanyDetailTabChip({
  tabKey,
  selected,
  onPress,
}: {
  tabKey: CompanyDetailTabKey;
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
        {getCompanyDetailTabLabel(tabKey)}
      </Text>
    </TouchableOpacity>
  );
}

function CompanyMetricRows({
  metrics,
  emptyText,
  onOpenUrl,
  showCalculatedPercentage = false,
}: {
  metrics: CompanyDetailMetric[];
  emptyText: string;
  onOpenUrl?: (url: string) => void;
  showCalculatedPercentage?: boolean;
}) {
  const metricNumbers = React.useMemo(
    () =>
      metrics.map((metricItem) => ({
        label: metricItem.label,
        value: metricItem.value,
        numericValue: parseNumericMetricValue(metricItem.value),
        embeddedPercentage: parseEmbeddedPercentage(metricItem.value),
      })),
    [metrics]
  );

  const percentageDenominator = React.useMemo(() => {
    if (!showCalculatedPercentage) {
      return null;
    }

    const marketCapMetric = metricNumbers.find(
      (metricItem) =>
        /market\s*cap/i.test(metricItem.label) &&
        typeof metricItem.numericValue === "number" &&
        metricItem.numericValue > 0
    );
    if (marketCapMetric && marketCapMetric.numericValue) {
      return marketCapMetric.numericValue;
    }

    const total = metricNumbers.reduce((runningTotal, metricItem) => {
      if (typeof metricItem.numericValue !== "number" || metricItem.numericValue <= 0) {
        return runningTotal;
      }

      return runningTotal + metricItem.numericValue;
    }, 0);

    return total > 0 ? total : null;
  }, [metricNumbers, showCalculatedPercentage]);

  if (metrics.length === 0) {
    return (
      <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
        {emptyText}
      </Text>
    );
  }

  return (
    <View className="gap-2">
      {metricNumbers.map((metricItem) => {
        const detectedUrl = extractUrlFromText(metricItem.value);
        const canOpenUrl = Boolean(detectedUrl) && Boolean(onOpenUrl);
        const computedPercentage =
          showCalculatedPercentage &&
          metricItem.embeddedPercentage === null &&
          typeof metricItem.numericValue === "number" &&
          percentageDenominator &&
          percentageDenominator > 0
            ? (metricItem.numericValue / percentageDenominator) * 100
            : null;
        const percentageText =
          metricItem.embeddedPercentage !== null
            ? formatMetricPercentage(metricItem.embeddedPercentage)
            : computedPercentage !== null
              ? formatMetricPercentage(computedPercentage)
              : null;

        return (
          <View
            key={`${metricItem.label}-${metricItem.value}`}
            className="rounded-xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/5"
          >
            <Text className="text-[11px] font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              {metricItem.label}
            </Text>
            {canOpenUrl ? (
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={() => {
                  if (detectedUrl && onOpenUrl) {
                    onOpenUrl(detectedUrl);
                  }
                }}
                className="mt-1"
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="middle"
                  className="text-sm font-bold text-app-highlight underline dark:text-app-highlightDark"
                >
                  {metricItem.value}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
                {metricItem.value}
                {percentageText ? (
                  <Text className="text-xs font-bold text-app-highlight dark:text-app-highlightDark">
                    {`  (${percentageText})`}
                  </Text>
                ) : null}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function CompanyMatrixTableCard({
  table,
  emptyText,
}: {
  table: CompanyDetailMatrixTable | null;
  emptyText: string;
}) {
  if (!table || table.rows.length === 0 || table.columns.length === 0) {
    return (
      <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
        {emptyText}
      </Text>
    );
  }

  const visibleRows = table.rows.slice(0, 10);

  return (
    <View className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
      <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
        {table.title}
      </Text>

      <View className="mt-2">
        {visibleRows.map((rowItem, rowIndex) => (
          <View
            key={`${rowItem.label}-${rowIndex}`}
            className={[
              "py-2",
              rowIndex < visibleRows.length - 1
                ? "border-b border-app-highlight/12 dark:border-app-highlightDark/20"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
              {rowItem.label}
            </Text>

            <View className="mt-2 gap-1">
              {table.columns.map((columnLabel, columnIndex) => (
                <View
                  key={`${rowItem.label}-${columnLabel}-${columnIndex}`}
                  className="flex-row items-start justify-between gap-3"
                >
                  <Text className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    {columnLabel}
                  </Text>
                  <Text className="max-w-[58%] text-right text-sm font-semibold text-app-text dark:text-app-textDark">
                    {rowItem.values[columnIndex] ?? "--"}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      {table.rows.length > visibleRows.length ? (
        <Text className="mt-2 text-[10px] font-semibold text-app-text dark:text-app-textDark">
          Showing latest {visibleRows.length} rows.
        </Text>
      ) : null}
    </View>
  );
}

export default function StockDetailScreen() {
  const router = useGuardedRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchParams = useLocalSearchParams<{
    symbol?: string | string[];
    origin?: string | string[];
  }>();
  const normalizedSymbol = React.useMemo(() => {
    const rawSymbol = Array.isArray(searchParams.symbol)
      ? searchParams.symbol[0]
      : searchParams.symbol;
    return (rawSymbol ?? "").trim().toUpperCase();
  }, [searchParams.symbol]);
  const normalizedOrigin = React.useMemo(() => {
    const rawOrigin = Array.isArray(searchParams.origin)
      ? searchParams.origin[0]
      : searchParams.origin;
    return (rawOrigin ?? "").trim().toLowerCase();
  }, [searchParams.origin]);
  const shouldLoadCompanyDetail = COMPANY_DETAIL_ALLOWED_ORIGINS.has(normalizedOrigin);

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
  const [companyDetail, setCompanyDetail] =
    React.useState<CompanyDetailSnapshot | null>(null);
  const [isCompanyDetailLoading, setIsCompanyDetailLoading] = React.useState(false);
  const [selectedCompanyTab, setSelectedCompanyTab] =
    React.useState<CompanyDetailTabKey>("profile");
  const chartRequestIdRef = React.useRef(0);
  const companyDetailRequestIdRef = React.useRef(0);

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

  const refreshCompanyDetail = React.useCallback(
    async (showLoader = false) => {
      const requestId = companyDetailRequestIdRef.current + 1;
      companyDetailRequestIdRef.current = requestId;

      if (!shouldLoadCompanyDetail || normalizedSymbol.length === 0) {
        if (requestId === companyDetailRequestIdRef.current) {
          setCompanyDetail(null);
          setIsCompanyDetailLoading(false);
        }
        return;
      }

      if (showLoader) {
        setIsCompanyDetailLoading(true);
      }

      try {
        const cachedDetail = await getCachedCompanyDetail(normalizedSymbol);
        if (cachedDetail && requestId === companyDetailRequestIdRef.current) {
          setCompanyDetail(cachedDetail);
        }

        const latestDetail = await getLatestCompanyDetail(normalizedSymbol);
        if (latestDetail && requestId === companyDetailRequestIdRef.current) {
          setCompanyDetail(latestDetail);
        }
      } finally {
        if (showLoader && requestId === companyDetailRequestIdRef.current) {
          setIsCompanyDetailLoading(false);
        }
      }
    },
    [normalizedSymbol, shouldLoadCompanyDetail]
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

  React.useEffect(() => {
    setSelectedCompanyTab("profile");
  }, [normalizedOrigin, normalizedSymbol]);

  React.useEffect(() => {
    if (!shouldLoadCompanyDetail || normalizedSymbol.length === 0) {
      setCompanyDetail(null);
      setIsCompanyDetailLoading(false);
      return;
    }

    void refreshCompanyDetail(true);
  }, [normalizedSymbol, refreshCompanyDetail, shouldLoadCompanyDetail]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const refreshTasks: Promise<unknown>[] = [
        hydrateSymbolMeta(),
        refreshQuote(),
        refreshChart(chartRange),
      ];

      if (shouldLoadCompanyDetail) {
        refreshTasks.push(refreshCompanyDetail());
      }

      await Promise.all(refreshTasks);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    chartRange,
    hydrateSymbolMeta,
    refreshChart,
    refreshCompanyDetail,
    refreshQuote,
    shouldLoadCompanyDetail,
  ]);

  const handleOpenExternalUrl = React.useCallback(async (rawUrl: string) => {
    const normalizedUrl = normalizeExternalUrl(rawUrl);
    if (normalizedUrl.length === 0) {
      return;
    }

    try {
      await Linking.openURL(normalizedUrl);
    } catch {
      // Ignore URL open failures to avoid breaking the screen interaction.
    }
  }, []);

  const handleOpenPdfInApp = React.useCallback(
    (pdfUrl: string, announcementTitle: string) => {
      const normalizedUrl = normalizeExternalUrl(pdfUrl);
      if (normalizedUrl.length === 0) {
        return;
      }

      router.push({
        pathname: "/pdf-viewer",
        params: {
          url: normalizedUrl,
          title:
            announcementTitle.trim().length > 0
              ? announcementTitle
              : `${normalizedSymbol} PDF`,
        },
      });
    },
    [normalizedSymbol, router]
  );

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
  const latestPriceFromChart = chartLastPoint?.price ?? 0;
  const displayPrice = quote.lastPrice > 0 ? quote.lastPrice : latestPriceFromChart;
  const displayChange = quote.change;
  const displayChangePct = quote.changePct;

  const headerTitle = normalizedSymbol.length > 0 ? normalizedSymbol : "Stock Detail";
  const companyName =
    companyDetail?.companyName ?? symbolMeta?.name ?? "Unknown Company";
  const sectorName = companyDetail?.sector ?? symbolMeta?.sectorName ?? "UNKNOWN";
  const companyAnnouncementItems = companyDetail?.announcements.slice(0, 15) ?? [];
  const companyDetailsSourceLabel = companyDetail
    ? companyDetail.source === "cache"
      ? "Cached"
      : "Live"
    : "Pending";
  const companyDetailsUpdatedAt =
    companyDetail?.updatedAt && companyDetail.updatedAt.length > 0
      ? formatUpdatedAt(companyDetail.updatedAt)
      : "--";

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
              {headerTitle}
            </Text>

            <View className="w-14" />
          </View>

          {isInitialLoading ? (
            <View className="rounded-3xl bg-brand-white/95 p-6 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
              <AppSkeletonTextGroup rows={5} rowHeight={14} />
            </View>
          ) : normalizedSymbol.length === 0 ? (
            <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
              <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
                Invalid symbol
              </Text>
              <Text className="mt-2 text-sm text-app-text dark:text-app-textDark">
                Please open this screen from the Stocks list.
              </Text>
            </View>
          ) : (
            <>
              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
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
                  {formatPKRAmount(displayPrice)}
                </Text>
                <Text
                  className={[
                    "mt-1 text-sm font-semibold",
                    getValueToneClassName(displayChange),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {`${formatPKRAmount(displayChange)} (${formatSignedPercentage(
                    displayChangePct
                  )})`}
                </Text>
              </View>

              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
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
                    <AppChartSkeleton height={170} />
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

              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
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

              {shouldLoadCompanyDetail ? (
                <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                      Company Details
                    </Text>
                    <Text className="text-[11px] font-semibold text-app-text dark:text-app-textDark">
                      {companyDetailsSourceLabel} • {companyDetailsUpdatedAt}
                    </Text>
                  </View>

                  <View className="mt-3 flex-row flex-wrap gap-2">
                    {COMPANY_DETAIL_TAB_KEYS.map((tabKey) => (
                      <CompanyDetailTabChip
                        key={tabKey}
                        tabKey={tabKey}
                        selected={selectedCompanyTab === tabKey}
                        onPress={() => setSelectedCompanyTab(tabKey)}
                      />
                    ))}
                  </View>

                  <View className="mt-4 gap-3">
                    {isCompanyDetailLoading && !companyDetail ? (
                      <View className="rounded-2xl bg-brand-white/70 p-4 dark:bg-brand-white/5">
                        <AppSkeletonTextGroup rows={4} rowHeight={12} />
                      </View>
                    ) : !companyDetail ? (
                      <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                        Could not load company detail information right now.
                      </Text>
                    ) : (
                      <>
                        {isCompanyDetailLoading ? (
                          <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                            Refreshing company details...
                          </Text>
                        ) : null}

                        {selectedCompanyTab === "profile" ? (
                          <View className="gap-3">
                            {companyDetail.businessDescription ? (
                              <View className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
                                <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                                  Business Description
                                </Text>
                                <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                                  {companyDetail.businessDescription}
                                </Text>
                              </View>
                            ) : null}

                            <View className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
                              <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                                Profile Facts
                              </Text>
                              <View className="mt-2">
                                <CompanyMetricRows
                                  metrics={companyDetail.profileMetrics}
                                  emptyText="No profile facts available."
                                  onOpenUrl={handleOpenExternalUrl}
                                />
                              </View>
                            </View>

                            <View className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
                              <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                                Key People
                              </Text>
                              {companyDetail.keyPeople.length === 0 ? (
                                <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                                  No key people data available.
                                </Text>
                              ) : (
                                <View className="mt-2 gap-2">
                                  {companyDetail.keyPeople.map((person, personIndex) => (
                                    <View
                                      key={`${person.name}-${person.role}-${personIndex}`}
                                      className="flex-row items-start justify-between gap-3 rounded-xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/5"
                                    >
                                      <Text className="flex-1 text-sm font-semibold text-app-text dark:text-app-textDark">
                                        {person.name}
                                      </Text>
                                      <Text className="w-32 text-right text-sm font-bold text-app-text dark:text-app-textDark">
                                        {person.role}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          </View>
                        ) : null}

                        {selectedCompanyTab === "equity" ? (
                          <View className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
                            <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                              Equity Snapshot
                            </Text>
                            <View className="mt-2">
                              <CompanyMetricRows
                                metrics={companyDetail.equityMetrics}
                                emptyText="No equity metrics available."
                                onOpenUrl={handleOpenExternalUrl}
                                showCalculatedPercentage
                              />
                            </View>
                          </View>
                        ) : null}

                        {selectedCompanyTab === "financials" ? (
                          <View className="gap-3">
                            <CompanyMatrixTableCard
                              table={companyDetail.annualFinancials}
                              emptyText="No annual financial table available."
                            />
                            <CompanyMatrixTableCard
                              table={companyDetail.quarterlyFinancials}
                              emptyText="No quarterly financial table available."
                            />
                          </View>
                        ) : null}

                        {selectedCompanyTab === "ratios" ? (
                          <CompanyMatrixTableCard
                            table={companyDetail.ratioTable}
                            emptyText="No ratio table available."
                          />
                        ) : null}

                        {selectedCompanyTab === "announcements" ? (
                          companyAnnouncementItems.length === 0 ? (
                            <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                              No announcements available.
                            </Text>
                          ) : (
                            <View className="gap-2">
                              {companyAnnouncementItems.map(
                                (announcement: CompanyDetailAnnouncement, announcementIndex) => (
                                  <View
                                    key={`${announcement.category}-${announcement.date}-${announcementIndex}`}
                                    className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5"
                                  >
                                    <View className="flex-row items-center justify-between gap-3">
                                      <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                                        {announcement.category}
                                      </Text>
                                      <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                                        {announcement.date}
                                      </Text>
                                    </View>
                                    <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                                      {announcement.title}
                                    </Text>
                                    <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                                      {announcement.document}
                                    </Text>
                                    {announcement.pdfUrl ? (
                                      <TouchableOpacity
                                        activeOpacity={0.86}
                                        onPress={() => {
                                          handleOpenPdfInApp(
                                            announcement.pdfUrl ?? "",
                                            announcement.title
                                          );
                                        }}
                                        className="mt-2 self-start rounded-xl bg-app-highlight px-3 py-2 dark:bg-app-highlightDark"
                                      >
                                        <Text className="text-xs font-bold uppercase tracking-wide text-brand-white dark:text-brand-purple">
                                          View PDF
                                        </Text>
                                      </TouchableOpacity>
                                    ) : null}
                                  </View>
                                )
                              )}
                            </View>
                          )
                        ) : null}
                      </>
                    )}
                  </View>
                </View>
              ) : null}

            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
