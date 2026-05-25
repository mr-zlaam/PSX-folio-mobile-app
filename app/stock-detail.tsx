import StockLineChart from "@/components/charts/stock-line-chart";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppBackgroundRefreshIndicator from "@/components/ui/app-background-refresh-indicator";
import {
  AppChartSkeleton,
  AppDetailScreenSkeleton,
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
import { useBackgroundSyncIndicator } from "@/src/lib/use-background-sync-indicator";
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React from "react";
import {
  Linking,
  PanResponder,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
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
const COMPANY_DETAIL_TOP_TAB_KEYS = [
  "profile",
  "fundamentals",
  "announcements",
] as const;
const FUNDAMENTALS_TAB_KEYS = ["equity", "financials", "ratios"] as const;
const ANNOUNCEMENT_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "dividend", label: "Dividend" },
  { value: "boardMeeting", label: "Board Meeting" },
  { value: "financialResults", label: "Financial Results" },
  { value: "corporateBriefing", label: "Briefing Session" },
  { value: "materialInfo", label: "Material Update" },
  { value: "disclosureOfInterest", label: "Interest Disclosure" },
  { value: "other", label: "General Notice" },
] as const;

type CompanyDetailTopTabKey = (typeof COMPANY_DETAIL_TOP_TAB_KEYS)[number];
type FundamentalsTabKey = (typeof FUNDAMENTALS_TAB_KEYS)[number];
type AnnouncementFilterKey = (typeof ANNOUNCEMENT_FILTER_OPTIONS)[number]["value"];
type CategorizedAnnouncementItem = CompanyDetailAnnouncement & {
  normalizedCategory: AnnouncementFilterKey;
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

function getValueToneBackgroundClassName(value: number): string {
  if (value > 0) {
    return "bg-success-green";
  }

  if (value < 0) {
    return "bg-brand-red";
  }

  return "bg-app-highlight dark:bg-app-highlightDark";
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

function getCompanyDetailTopTabLabel(tabKey: CompanyDetailTopTabKey): string {
  if (tabKey === "profile") {
    return "Profile";
  }

  if (tabKey === "fundamentals") {
    return "Fundamentals";
  }

  return "Notices";
}

function getFundamentalsTabLabel(tabKey: FundamentalsTabKey): string {
  if (tabKey === "equity") {
    return "Equity";
  }

  if (tabKey === "financials") {
    return "Financials";
  }

  return "Ratios";
}

function CompanyDetailTopTabButton({
  tabKey,
  selected,
  onPress,
}: {
  tabKey: CompanyDetailTopTabKey;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className="flex-1 items-center px-2 pb-2 pt-1"
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        className={[
          "text-[12px] font-semibold",
          selected
            ? "text-app-highlight dark:text-app-highlightDark"
            : "text-app-text/60 dark:text-app-textDark/60",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {getCompanyDetailTopTabLabel(tabKey)}
      </Text>
      <View
        className={[
          "mt-2 h-[3px] w-full rounded-full",
          selected
            ? "bg-app-highlight dark:bg-app-highlightDark"
            : "bg-transparent",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </TouchableOpacity>
  );
}

function getAnnouncementFilterLabel(filterKey: AnnouncementFilterKey): string {
  const matchedFilter = ANNOUNCEMENT_FILTER_OPTIONS.find(
    (filterOption) => filterOption.value === filterKey
  );
  return matchedFilter?.label ?? "All";
}

function classifyAnnouncementCategory(
  announcement: CompanyDetailAnnouncement
): AnnouncementFilterKey {
  const containsAny = (value: string, tokens: readonly string[]): boolean => {
    return tokens.some((token) => value.includes(token));
  };

  const normalizedCategory = announcement.category.toLowerCase().trim();
  const normalizedText = `${announcement.category} ${announcement.title} ${announcement.document}`
    .toLowerCase()
    .trim();

  // Keep dividend first so dividend-type notices from "Others"
  // do not leak into broad categories.
  if (
    containsAny(normalizedText, [
      "dividend",
      "cash dividend",
      "interim dividend",
      "final dividend",
      "distribution",
      "payout",
      "dps",
    ])
  ) {
    return "dividend";
  }

  if (
    normalizedCategory.includes("board meeting") ||
    normalizedCategory.includes("board meetings")
  ) {
    return "boardMeeting";
  }

  if (normalizedCategory.includes("financial result")) {
    return "financialResults";
  }

  if (
    normalizedCategory.includes("corporate briefing") ||
    normalizedCategory.includes("briefing")
  ) {
    return "corporateBriefing";
  }

  if (
    normalizedCategory.includes("material information") ||
    normalizedCategory.includes("material info")
  ) {
    return "materialInfo";
  }

  if (normalizedCategory.includes("disclosure")) {
    return "disclosureOfInterest";
  }

  if (
    containsAny(normalizedText, [
      "board meeting",
      "board meetings",
      "board of directors",
      "bod meeting",
      "agm",
      "eogm",
    ])
  ) {
    return "boardMeeting";
  }

  if (
    containsAny(normalizedText, [
      "financial result",
      "financial results",
      "quarterly result",
      "annual result",
      "half yearly result",
      "half yearly report",
      "quarterly report",
      "annual report",
      "statement of accounts",
      "transmission of quarterly report",
      "period ended",
    ])
  ) {
    return "financialResults";
  }

  if (
    containsAny(normalizedText, [
      "corporate briefing",
      "briefing session",
      "cbs",
    ])
  ) {
    return "corporateBriefing";
  }

  if (
    containsAny(normalizedText, [
      "material information",
      "material info",
      "material development",
      "material update",
    ])
  ) {
    return "materialInfo";
  }

  if (
    containsAny(normalizedText, [
      "disclosure of interest",
      "disclosure",
    ])
  ) {
    return "disclosureOfInterest";
  }

  return "other";
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
        const shouldHidePercentageForMetric =
          /market\s*cap|shares|free\s*float/i.test(metricItem.label);
        const computedPercentage =
          showCalculatedPercentage &&
          metricItem.embeddedPercentage === null &&
          typeof metricItem.numericValue === "number" &&
          percentageDenominator &&
          percentageDenominator > 0
            ? (metricItem.numericValue / percentageDenominator) * 100
            : null;
        const percentageText =
          shouldHidePercentageForMetric
            ? null
            : metricItem.embeddedPercentage !== null
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
  const { height: windowHeight } = useWindowDimensions();
  const isDarkMode = colorScheme === "dark";
  const sheetDividerColor = isDarkMode
    ? "rgba(255, 255, 255, 0.08)"
    : "rgba(20, 10, 38, 0.08)";
  const sheetContainerBorderColor = isDarkMode
    ? "rgba(255, 255, 255, 0.08)"
    : "rgba(20, 10, 38, 0.06)";
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
  const [yearChartSeries, setYearChartSeries] = React.useState<StockChartSeries>(() =>
    getStockChartSeriesFallback("1Y")
  );
  const [isChartLoading, setIsChartLoading] = React.useState(true);
  const [selectedChartPoint, setSelectedChartPoint] =
    React.useState<StockChartPoint | null>(null);
  const [companyDetail, setCompanyDetail] =
    React.useState<CompanyDetailSnapshot | null>(null);
  const [isCompanyDetailLoading, setIsCompanyDetailLoading] = React.useState(false);
  const [selectedCompanyTopTab, setSelectedCompanyTopTab] =
    React.useState<CompanyDetailTopTabKey>("profile");
  const [selectedFundamentalsTab, setSelectedFundamentalsTab] =
    React.useState<FundamentalsTabKey>("equity");
  const [selectedAnnouncementFilter, setSelectedAnnouncementFilter] =
    React.useState<AnnouncementFilterKey>("all");
  const [showFinancialsInfo, setShowFinancialsInfo] = React.useState(false);
  const chartRequestIdRef = React.useRef(0);
  const yearChartRequestIdRef = React.useRef(0);
  const companyDetailRequestIdRef = React.useRef(0);
  const {
    isBackgroundSyncing,
    beginBackgroundSync,
    endBackgroundSync,
  } = useBackgroundSyncIndicator();
  const fundamentalsFilterSheetRef = React.useRef<BottomSheetModal>(null);
  const fundamentalsFilterSheetSnapPoints = React.useMemo(() => ["40%"], []);
  const announcementFilterSheetRef = React.useRef<BottomSheetModal>(null);
  const announcementFilterSheetSnapPoints = React.useMemo(() => ["60%"], []);

  const swipePanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const SWIPE_THRESHOLD = 10;
          return (
            Math.abs(gestureState.dx) > SWIPE_THRESHOLD &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          const SWIPE_DISTANCE = 50;
          if (gestureState.dx > SWIPE_DISTANCE) {
            setSelectedCompanyTopTab((prev) => {
              const currentIndex = COMPANY_DETAIL_TOP_TAB_KEYS.indexOf(prev);
              const prevIndex = Math.max(0, currentIndex - 1);
              return COMPANY_DETAIL_TOP_TAB_KEYS[prevIndex];
            });
          } else if (gestureState.dx < -SWIPE_DISTANCE) {
            setSelectedCompanyTopTab((prev) => {
              const currentIndex = COMPANY_DETAIL_TOP_TAB_KEYS.indexOf(prev);
              const nextIndex = Math.min(
                COMPANY_DETAIL_TOP_TAB_KEYS.length - 1,
                currentIndex + 1
              );
              return COMPANY_DETAIL_TOP_TAB_KEYS[nextIndex];
            });
          }
        },
      }),
    []
  );

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
    async (showLoader = false, forceLive = false) => {
      let didStartBackgroundSync = false;
      if (showLoader) {
        setIsInitialLoading(true);
      }

      try {
        if (normalizedSymbol.length === 0) {
          setQuote(getSymbolQuoteFallback(""));
          return;
        }

        const cachedQuote = await getCachedSymbolQuote(normalizedSymbol);
        const hasUsableCachedQuote = Boolean(
          cachedQuote &&
            (cachedQuote.asOf !== null ||
              cachedQuote.lastPrice > 0 ||
              cachedQuote.previousClose > 0)
        );
        if (cachedQuote) {
          setQuote(cachedQuote);
          if (showLoader && hasUsableCachedQuote) {
            setIsInitialLoading(false);
          }
        }

        if (hasUsableCachedQuote && !showLoader) {
          beginBackgroundSync();
          didStartBackgroundSync = true;
        }

        const latestQuote = await getLatestSymbolQuote(normalizedSymbol, {
          forceLive,
        });
        setQuote(latestQuote);
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

        if (hasUsableCachedSeries && !showLoader) {
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

  const refreshYearChart = React.useCallback(
    async (forceLive = false) => {
      const requestId = yearChartRequestIdRef.current + 1;
      yearChartRequestIdRef.current = requestId;
      let didStartBackgroundSync = false;

      if (normalizedSymbol.length === 0) {
        if (requestId === yearChartRequestIdRef.current) {
          setYearChartSeries(getStockChartSeriesFallback("1Y"));
        }
        return;
      }

      const cachedSeries = await getCachedStockChartSeries(normalizedSymbol, "1Y");
      const hasUsableCachedSeries = cachedSeries.points.length > 0;
      if (requestId === yearChartRequestIdRef.current && hasUsableCachedSeries) {
        setYearChartSeries(cachedSeries);
      }

      if (hasUsableCachedSeries) {
        beginBackgroundSync();
        didStartBackgroundSync = true;
      }

      try {
        const latestSeries = await getLatestStockChartSeries(normalizedSymbol, "1Y", {
          forceLive,
        });
        if (requestId === yearChartRequestIdRef.current) {
          setYearChartSeries(latestSeries);
        }
      } finally {
        if (didStartBackgroundSync) {
          endBackgroundSync();
        }
      }
    },
    [beginBackgroundSync, endBackgroundSync, normalizedSymbol]
  );

  const refreshCompanyDetail = React.useCallback(
    async (showLoader = false) => {
      const requestId = companyDetailRequestIdRef.current + 1;
      companyDetailRequestIdRef.current = requestId;
      let didStartBackgroundSync = false;

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

        if (cachedDetail && !showLoader) {
          beginBackgroundSync();
          didStartBackgroundSync = true;
        }

        const latestDetail = await getLatestCompanyDetail(normalizedSymbol);
        if (latestDetail && requestId === companyDetailRequestIdRef.current) {
          setCompanyDetail(latestDetail);
        }
      } finally {
        if (didStartBackgroundSync) {
          endBackgroundSync();
        }
        if (showLoader && requestId === companyDetailRequestIdRef.current) {
          setIsCompanyDetailLoading(false);
        }
      }
    },
    [
      beginBackgroundSync,
      endBackgroundSync,
      normalizedSymbol,
      shouldLoadCompanyDetail,
    ]
  );

  React.useEffect(() => {
    void hydrateSymbolMeta();
    void refreshQuote(true, true);
  }, [hydrateSymbolMeta, refreshQuote]);

  React.useEffect(() => {
    setSelectedChartPoint(null);
    void refreshChart(chartRange, true, true);
  }, [chartRange, refreshChart]);

  React.useEffect(() => {
    void refreshYearChart(true);
  }, [refreshYearChart]);

  React.useEffect(() => {
    setSelectedCompanyTopTab("profile");
    setSelectedFundamentalsTab("equity");
    setSelectedAnnouncementFilter("all");
  }, [normalizedOrigin, normalizedSymbol]);

  React.useEffect(() => {
    if (!shouldLoadCompanyDetail || normalizedSymbol.length === 0) {
      setCompanyDetail(null);
      setIsCompanyDetailLoading(false);
      return;
    }

    void refreshCompanyDetail(true);
  }, [normalizedSymbol, refreshCompanyDetail, shouldLoadCompanyDetail]);

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      const refreshTasks: Promise<unknown>[] = [
        refreshQuote(false, true),
        refreshChart(chartRange, false, true),
        refreshYearChart(true),
      ];

      if (shouldLoadCompanyDetail) {
        refreshTasks.push(refreshCompanyDetail());
      }

      void Promise.allSettled(refreshTasks);
    }, STOCK_DETAIL_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    chartRange,
    refreshChart,
    refreshCompanyDetail,
    refreshQuote,
    refreshYearChart,
    shouldLoadCompanyDetail,
  ]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const refreshTasks: Promise<unknown>[] = [
        hydrateSymbolMeta(),
        refreshQuote(false, true),
        refreshChart(chartRange, false, true),
        refreshYearChart(true),
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
    refreshYearChart,
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

  const handleOpenFundamentalsFilterSheet = React.useCallback(() => {
    fundamentalsFilterSheetRef.current?.present();
  }, []);

  const handleOpenAnnouncementFilterSheet = React.useCallback(() => {
    announcementFilterSheetRef.current?.present();
  }, []);

  const announcementFilterSheetBackdrop = React.useCallback(
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
  const displayPrice =
    chartRange === "1D" && latestPriceFromChart > 0
      ? latestPriceFromChart
      : quote.lastPrice > 0
        ? quote.lastPrice
        : latestPriceFromChart;
  const displayReferenceClose =
    quote.previousClose > 0
      ? quote.previousClose
      : Number.isFinite(quote.lastPrice - quote.change) &&
          quote.lastPrice - quote.change > 0
        ? quote.lastPrice - quote.change
        : 0;
  const displayChange =
    displayReferenceClose > 0 ? displayPrice - displayReferenceClose : quote.change;
  const displayChangePct =
    displayReferenceClose > 0
      ? (displayChange / displayReferenceClose) * 100
      : quote.changePct;
  const dayRange = React.useMemo(() => {
    const possibleValues = [
      quote.lowPrice,
      quote.highPrice,
      displayPrice,
      latestPriceFromChart,
    ].filter((value) => Number.isFinite(value) && value > 0);

    if (possibleValues.length === 0) {
      return null;
    }

    const lowCandidate = quote.lowPrice > 0 ? quote.lowPrice : Math.min(...possibleValues);
    const highCandidate =
      quote.highPrice > 0 ? quote.highPrice : Math.max(...possibleValues);
    const lowValue = Math.min(lowCandidate, highCandidate);
    const highValue = Math.max(lowCandidate, highCandidate);
    const currentValue =
      displayPrice > 0 ? displayPrice : latestPriceFromChart > 0 ? latestPriceFromChart : highValue;

    return {
      lowValue,
      highValue,
      currentValue,
    };
  }, [displayPrice, latestPriceFromChart, quote.highPrice, quote.lowPrice]);
  const week52Range = React.useMemo(() => {
    const pricePoints = yearChartSeries.points
      .map((pointItem) => pointItem.price)
      .filter((value) => Number.isFinite(value) && value > 0);

    if (pricePoints.length === 0) {
      if (!dayRange) {
        return null;
      }

      return {
        lowValue: dayRange.lowValue,
        highValue: dayRange.highValue,
        currentValue: dayRange.currentValue,
      };
    }

    const lowValue = Math.min(...pricePoints);
    const highValue = Math.max(...pricePoints);
    const fallbackCurrentValue = pricePoints[pricePoints.length - 1] ?? highValue;
    const currentValue = displayPrice > 0 ? displayPrice : fallbackCurrentValue;

    return {
      lowValue,
      highValue,
      currentValue,
    };
  }, [dayRange, displayPrice, yearChartSeries.points]);
  const rangeMarkerToneClassName = React.useMemo(
    () => getValueToneBackgroundClassName(displayChange),
    [displayChange]
  );

  const headerTitle = normalizedSymbol.length > 0 ? normalizedSymbol : "Stock Detail";
  const companyName =
    companyDetail?.companyName ?? symbolMeta?.name ?? "Unknown Company";
  const sectorName = companyDetail?.sector ?? symbolMeta?.sectorName ?? "UNKNOWN";
  const companyAnnouncementItems = React.useMemo(
    () => companyDetail?.announcements ?? [],
    [companyDetail?.announcements]
  );
  const categorizedCompanyAnnouncementItems =
    React.useMemo<CategorizedAnnouncementItem[]>(
      () =>
        companyAnnouncementItems.map((announcementItem) => ({
          ...announcementItem,
          normalizedCategory: classifyAnnouncementCategory(announcementItem),
        })),
      [companyAnnouncementItems]
    );
  const filteredCompanyAnnouncementItems = React.useMemo(() => {
    if (selectedAnnouncementFilter === "all") {
      return categorizedCompanyAnnouncementItems;
    }

    return categorizedCompanyAnnouncementItems.filter(
      (announcementItem) =>
        announcementItem.normalizedCategory === selectedAnnouncementFilter
    );
  }, [categorizedCompanyAnnouncementItems, selectedAnnouncementFilter]);
  const peRatioValue = React.useMemo(() => {
    const ratioRows = companyDetail?.ratioTable?.rows ?? [];
    for (const row of ratioRows) {
      if (/P\/E|price.*earning/i.test(row.label)) {
        return row.values[0] ?? null;
      }
    }
    return null;
  }, [companyDetail?.ratioTable]);
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
            <View
              style={{
                minHeight: Math.max(windowHeight - insets.bottom - 120, 560),
              }}
            >
              <AppDetailScreenSkeleton />
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
                  <View className="items-end gap-1">
                    <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                      {activePoint
                        ? formatPointTimestamp(activePoint.timestamp, chartRange)
                        : "--"}
                    </Text>
                  </View>
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

                <View className="mt-2 flex-row items-center justify-end">
                  <AppBackgroundRefreshIndicator
                    visible={isBackgroundSyncing}
                    label="Refreshing"
                  />
                </View>

                <View
                  className="mt-4"
                  style={{
                    opacity: isBackgroundSyncing && !isChartLoading ? 0.72 : 1,
                  }}
                >
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

              {dayRange ? (
                <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
                  <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Day&apos;s Range
                  </Text>
                  <View className="mt-3 flex-row items-center justify-between">
                    <View>
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Day Low
                      </Text>
                      <Text className="mt-1 text-lg font-extrabold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(dayRange.lowValue)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Day High
                      </Text>
                      <Text className="mt-1 text-lg font-extrabold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(dayRange.highValue)}
                      </Text>
                    </View>
                  </View>
                  <RangeBar
                    lowValue={dayRange.lowValue}
                    highValue={dayRange.highValue}
                    currentValue={dayRange.currentValue}
                    markerToneClassName={rangeMarkerToneClassName}
                  />
                  <Text className="mt-2 text-xs font-semibold text-app-text dark:text-app-textDark">
                    Current: {formatPKRAmount(dayRange.currentValue)}
                  </Text>
                </View>
              ) : null}

              {week52Range ? (
                <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
                  <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    52-Week Range
                  </Text>
                  <View className="mt-3 flex-row items-center justify-between">
                    <View>
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        52-Week Low
                      </Text>
                      <Text className="mt-1 text-lg font-extrabold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(week52Range.lowValue)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        52-Week High
                      </Text>
                      <Text className="mt-1 text-lg font-extrabold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(week52Range.highValue)}
                      </Text>
                    </View>
                  </View>
                  <RangeBar
                    lowValue={week52Range.lowValue}
                    highValue={week52Range.highValue}
                    currentValue={week52Range.currentValue}
                    markerToneClassName={rangeMarkerToneClassName}
                  />
                  <Text className="mt-2 text-xs font-semibold text-app-text dark:text-app-textDark">
                    Current: {formatPKRAmount(week52Range.currentValue)}
                  </Text>
                </View>
              ) : null}

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

                  <View className="mt-3 border-b border-app-highlight/15 dark:border-app-highlightDark/20">
                    <View className="flex-row items-center">
                      {COMPANY_DETAIL_TOP_TAB_KEYS.map((tabKey) => (
                        <CompanyDetailTopTabButton
                          key={tabKey}
                          tabKey={tabKey}
                          selected={selectedCompanyTopTab === tabKey}
                          onPress={() => setSelectedCompanyTopTab(tabKey)}
                        />
                      ))}
                    </View>
                  </View>

                  <View className="mt-4">
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
                          <Text className="mb-3 text-xs font-semibold text-app-text dark:text-app-textDark">
                            Refreshing company details...
                          </Text>
                        ) : null}

                        <View {...swipePanResponder.panHandlers}>
                          {selectedCompanyTopTab === "profile" ? (
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

                          {selectedCompanyTopTab === "fundamentals" ? (
                            <View className="gap-3">
                              {peRatioValue ? (
                                <View className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
                                  <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                                    P/E Ratio (TTM)
                                  </Text>
                                  <Text className="mt-1 text-lg font-extrabold text-app-text dark:text-app-textDark">
                                    {peRatioValue}
                                  </Text>
                                </View>
                              ) : null}
                              <View className="flex-row items-center justify-between rounded-xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/5">
                                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                                  {getFundamentalsTabLabel(selectedFundamentalsTab)}
                                </Text>
                                <TouchableOpacity
                                  activeOpacity={0.86}
                                  onPress={handleOpenFundamentalsFilterSheet}
                                  className="h-8 w-8 items-center justify-center rounded-lg bg-app-highlight/8 dark:bg-brand-white/10"
                                >
                                  <MaterialCommunityIcons
                                    name="filter-variant"
                                    size={16}
                                    color={
                                      isDarkMode
                                        ? APP_COLORS.brand.white
                                        : APP_COLORS.brand.purple
                                    }
                                  />
                                </TouchableOpacity>
                              </View>

                              {selectedFundamentalsTab === "equity" ? (
                                <View className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
                                  <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                                    Equity Snapshot
                                  </Text>
                                  <View className="mt-2">
                                    <CompanyMetricRows
                                      metrics={companyDetail.equityMetrics.map(
                                        (m) =>
                                          /free\s*float/i.test(m.label)
                                            ? {
                                                ...m,
                                                value: m.value.includes("%")
                                                  ? m.value
                                                  : `${m.value}%`,
                                              }
                                            : m
                                      )}
                                      emptyText="No equity metrics available."
                                      onOpenUrl={handleOpenExternalUrl}
                                      showCalculatedPercentage
                                    />
                                  </View>
                                </View>
                              ) : null}

                              {selectedFundamentalsTab === "financials" ? (
                                <View className="gap-3">
                                  <TouchableOpacity
                                    activeOpacity={0.86}
                                    onPress={() =>
                                      setShowFinancialsInfo(!showFinancialsInfo)
                                    }
                                    className="flex-row items-center gap-1.5 rounded-xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/5"
                                  >
                                    <MaterialCommunityIcons
                                      name="information-outline"
                                      size={14}
                                      color={
                                        isDarkMode
                                          ? APP_COLORS.brand.white
                                          : APP_COLORS.brand.purple
                                      }
                                    />
                                    <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                                      All numbers in thousands (000s) except EPS
                                    </Text>
                                    <MaterialCommunityIcons
                                      name={
                                        showFinancialsInfo
                                          ? "chevron-up"
                                          : "chevron-down"
                                      }
                                      size={14}
                                      color={
                                        isDarkMode
                                          ? APP_COLORS.brand.white
                                          : APP_COLORS.brand.purple
                                      }
                                    />
                                  </TouchableOpacity>
                                  {showFinancialsInfo ? (
                                    <View className="rounded-xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
                                      <Text className="text-xs font-semibold leading-5 text-app-text dark:text-app-textDark">
                                        All values in financial statements are
                                        presented in thousands of the reporting
                                        currency (PKR), meaning you should
                                        multiply each figure by 1,000 to get the
                                        actual value, except for Earnings Per
                                        Share (EPS) which is shown in actual
                                        units.
                                      </Text>
                                    </View>
                                  ) : null}
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

                              {selectedFundamentalsTab === "ratios" ? (
                                <CompanyMatrixTableCard
                                  table={companyDetail.ratioTable}
                                  emptyText="No ratio table available."
                                />
                              ) : null}
                            </View>
                          ) : null}

                          {selectedCompanyTopTab === "announcements" ? (
                            <View className="gap-3">
                              <View className="flex-row items-center justify-between">
                              <Text className="text-[11px] font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
                                Filter
                              </Text>
                              <TouchableOpacity
                                activeOpacity={0.86}
                                onPress={handleOpenAnnouncementFilterSheet}
                                className="rounded-xl border border-app-highlight/15 bg-app-highlight/5 px-3 py-2 dark:border-app-highlightDark/12 dark:bg-brand-white/8"
                              >
                                <View className="flex-row items-center gap-2">
                                  <MaterialCommunityIcons
                                    name="filter-variant"
                                    size={16}
                                    color={
                                      isDarkMode
                                        ? APP_COLORS.brand.white
                                        : APP_COLORS.brand.purple
                                    }
                                  />
                                  <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                                    {getAnnouncementFilterLabel(
                                      selectedAnnouncementFilter
                                    ).toUpperCase()}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            </View>

                            {companyAnnouncementItems.length === 0 ? (
                              <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                                No announcements available.
                              </Text>
                            ) : filteredCompanyAnnouncementItems.length ===
                              0 ? (
                              <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                                No announcements in this category.
                              </Text>
                            ) : (
                              <View className="gap-2">
                                {filteredCompanyAnnouncementItems.map(
                                  (
                                    announcement: CategorizedAnnouncementItem,
                                    announcementIndex
                                  ) => {
                                    const hasPdfUrl =
                                      Boolean(announcement.pdfUrl) &&
                                      announcement.pdfUrl!.trim().length > 0;

                                    return (
                                      <TouchableOpacity
                                        key={`${announcement.category}-${announcement.date}-${announcementIndex}`}
                                        activeOpacity={hasPdfUrl ? 0.86 : 1}
                                        disabled={!hasPdfUrl}
                                        onPress={() => {
                                          if (hasPdfUrl && announcement.pdfUrl) {
                                            handleOpenPdfInApp(
                                              announcement.pdfUrl,
                                              announcement.title
                                            );
                                          }
                                        }}
                                        className={[
                                          "rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5",
                                          !hasPdfUrl ? "opacity-80" : "",
                                        ]
                                          .filter(Boolean)
                                          .join(" ")}
                                      >
                                          <View className="flex-row items-center justify-between gap-3">
                                            <Text className="flex-1 text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                                              {getAnnouncementFilterLabel(
                                                announcement.normalizedCategory
                                              )}
                                            </Text>
                                            <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                                              {announcement.date}
                                            </Text>
                                          </View>
                                          <Text
                                            numberOfLines={2}
                                            className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark"
                                          >
                                            {announcement.title}
                                          </Text>
                                          <Text
                                            numberOfLines={2}
                                            className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark"
                                          >
                                            {announcement.document}
                                          </Text>
                                      </TouchableOpacity>
                                    );
                                  }
                                )}
                              </View>
                            )}

                            <View className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
                              <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                                Financial Reports
                              </Text>
                              {(() => {
                                const reportPdfs =
                                  filteredCompanyAnnouncementItems.filter(
                                    (a) =>
                                      a.pdfUrl &&
                                      a.pdfUrl.trim().length > 0
                                  );
                                return reportPdfs.length === 0 ? (
                                  <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                                    No reports available.
                                  </Text>
                                ) : (
                                  <View className="mt-2 gap-2">
                                    {reportPdfs.map(
                                      (announcement, reportIndex) => {
                                        const pdfUrl =
                                          announcement.pdfUrl!.startsWith(
                                            "/"
                                          )
                                            ? `https://dps.psx.com.pk${announcement.pdfUrl}`
                                            : announcement.pdfUrl!;
                                        return (
                                          <TouchableOpacity
                                            key={`report-${reportIndex}`}
                                            activeOpacity={0.86}
                                            onPress={() => {
                                              handleOpenPdfInApp(
                                                pdfUrl,
                                                announcement.title
                                              );
                                            }}
                                            className="rounded-xl border border-app-highlight/15 bg-app-highlight/5 p-3 dark:border-app-highlightDark/12 dark:bg-brand-white/8"
                                          >
                                            <View className="flex-row items-start gap-2">
                                              <MaterialCommunityIcons
                                                name="file-document-outline"
                                                size={18}
                                                color={
                                                  isDarkMode
                                                    ? APP_COLORS.brand.white
                                                    : APP_COLORS.brand.purple
                                                }
                                                style={{
                                                  marginTop: 2,
                                                }}
                                              />
                                              <View className="flex-1">
                                                <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                                                  {announcement.title}
                                                </Text>
                                                <Text className="mt-0.5 text-[11px] font-semibold text-app-text dark:text-app-textDark opacity-60">
                                                  {announcement.date}
                                                </Text>
                                              </View>
                                              <MaterialCommunityIcons
                                                name="open-in-new"
                                                size={16}
                                                color={
                                                  isDarkMode
                                                    ? "rgba(255,255,255,0.4)"
                                                    : "rgba(40,40,43,0.4)"
                                                }
                                              />
                                            </View>
                                          </TouchableOpacity>
                                        );
                                      }
                                    )}
                                  </View>
                                );
                              })()}
                            </View>
                            </View>
                          ) : null}
                        </View>
                      </>
                    )}
                  </View>
                </View>
              ) : null}

            </>
          )}
        </View>
      </ScrollView>

      <BottomSheetModal
        ref={fundamentalsFilterSheetRef}
        snapPoints={fundamentalsFilterSheetSnapPoints}
        enablePanDownToClose
        backdropComponent={announcementFilterSheetBackdrop}
        backgroundStyle={{
          backgroundColor: isDarkMode
            ? APP_COLORS.brand.purple
            : APP_COLORS.brand.white,
        }}
        handleIndicatorStyle={{
          backgroundColor: isDarkMode
            ? APP_COLORS.brand.white
            : APP_COLORS.brand.purple,
        }}
      >
        <BottomSheetView
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <Text className="text-lg font-extrabold text-app-text dark:text-app-textDark">
            Fundamentals
          </Text>

          <View
            className="mt-4 rounded-2xl bg-brand-white p-2 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10"
            style={{
              borderWidth: 1,
              borderColor: sheetContainerBorderColor,
            }}
          >
            {FUNDAMENTALS_TAB_KEYS.map((tabKey, tabIndex) => {
              const selected = selectedFundamentalsTab === tabKey;

              return (
                <View key={tabKey}>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={() => {
                      setSelectedFundamentalsTab(tabKey);
                      fundamentalsFilterSheetRef.current?.dismiss();
                    }}
                    className={[
                      "flex-row items-center justify-between rounded-xl px-3 py-3",
                      selected ? "bg-app-highlight/8 dark:bg-brand-white/10" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      {getFundamentalsTabLabel(tabKey)}
                    </Text>
                    {selected ? (
                      <MaterialCommunityIcons
                        name="check"
                        size={20}
                        color={
                          isDarkMode
                            ? APP_COLORS.brand.white
                            : APP_COLORS.brand.purple
                        }
                      />
                    ) : null}
                  </TouchableOpacity>

                  {tabIndex < FUNDAMENTALS_TAB_KEYS.length - 1 ? (
                    <View
                      style={{
                        marginHorizontal: 12,
                        height: 1,
                        backgroundColor: sheetDividerColor,
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={announcementFilterSheetRef}
        snapPoints={announcementFilterSheetSnapPoints}
        enablePanDownToClose
        backdropComponent={announcementFilterSheetBackdrop}
        backgroundStyle={{
          backgroundColor: isDarkMode
            ? APP_COLORS.brand.purple
            : APP_COLORS.brand.white,
        }}
        handleIndicatorStyle={{
          backgroundColor: isDarkMode
            ? APP_COLORS.brand.white
            : APP_COLORS.brand.purple,
        }}
      >
        <BottomSheetView
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <Text className="text-lg font-extrabold text-app-text dark:text-app-textDark">
            Filter by Category
          </Text>

          <View
            className="mt-4 rounded-2xl bg-brand-white p-2 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10"
            style={{
              borderWidth: 1,
              borderColor: sheetContainerBorderColor,
            }}
          >
            {ANNOUNCEMENT_FILTER_OPTIONS.map((filterOption, filterIndex) => {
              const selected = selectedAnnouncementFilter === filterOption.value;

              return (
                <View key={filterOption.value}>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={() => {
                      setSelectedAnnouncementFilter(filterOption.value);
                      announcementFilterSheetRef.current?.dismiss();
                    }}
                    className={[
                      "flex-row items-center justify-between rounded-xl px-3 py-3",
                      selected ? "bg-app-highlight/8 dark:bg-brand-white/10" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      {filterOption.label}
                    </Text>
                    {selected ? (
                      <MaterialCommunityIcons
                        name="check"
                        size={20}
                        color={
                          isDarkMode
                            ? APP_COLORS.brand.white
                            : APP_COLORS.brand.purple
                        }
                      />
                    ) : null}
                  </TouchableOpacity>

                  {filterIndex < ANNOUNCEMENT_FILTER_OPTIONS.length - 1 ? (
                    <View
                      style={{
                        marginHorizontal: 12,
                        height: 1,
                        backgroundColor: sheetDividerColor,
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
