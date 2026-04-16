import React from "react";
import { useGuardedRouter } from "@/src/lib/navigation";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AppState,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import AppFeedbackModal, {
  AppFeedbackModalTone,
} from "@/components/ui/app-feedback-modal";
import AppBackgroundRefreshIndicator from "@/components/ui/app-background-refresh-indicator";
import {
  AppListScreenSkeleton,
  AppSkeletonBlock,
} from "@/components/ui/app-skeleton";
import ShariahChip from "@/components/ui/shariah-chip";
import {
  exportPortfolioWorkbookBackup,
  importPortfolioWorkbookBackupFromFile,
} from "@/src/features/backup/portfolio-workbook-backup";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
  PortfolioHolding,
} from "@/src/features/portfolio/portfolio-data";
import { getCachedDpsMarketStatus } from "@/src/features/market/dps-market-status";
import { subscribeToTradeMutations } from "@/src/features/trade/trade-events";
import {
  formatCompactPKRAmount,
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import {
  getPortfolioDisplayModePreference,
  getPortfolioGroupingModePreference,
  setPortfolioDisplayModePreference,
  setPortfolioGroupingModePreference,
} from "@/src/lib/app-preferences";
import { useBackgroundSyncIndicator } from "@/src/lib/use-background-sync-indicator";
import { APP_COLORS } from "@/src/theme/colors";

const PORTFOLIO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type PortfolioGroupingMode = "companies" | "sectors";
type PortfolioDisplayMode = "price" | "percentage";
type BackupNoticeState = {
  title: string;
  message: string;
  tone: AppFeedbackModalTone;
};

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

function isCompactPkrValue(value: number): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }

  return Math.abs(value) >= 100_000;
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

function FilterRowOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className={[
        "flex-row items-center justify-between rounded-xl border px-3 py-3",
        selected
          ? "border-app-highlight/20 bg-app-highlight/8 dark:border-app-highlightDark/14 dark:bg-brand-white/8"
          : "border-app-highlight/12 bg-brand-white dark:border-app-highlightDark/12 dark:bg-brand-white/5",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-sm font-semibold",
          selected
            ? "text-app-highlight dark:text-app-highlightDark"
            : "text-app-text dark:text-app-textDark",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </Text>
      <MaterialCommunityIcons
        name={selected ? "check-circle" : "checkbox-blank-circle-outline"}
        size={18}
        color={
          selected
            ? isDarkMode
              ? APP_COLORS.brand.white
              : APP_COLORS.brand.purple
            : isDarkMode
              ? "rgba(255, 255, 255, 0.55)"
              : "rgba(40, 40, 43, 0.55)"
        }
      />
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
    totalInvested === 0 ? 0 : (holding.marketValue / totalInvested) * 100;
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
                className={[
                  "text-sm font-extrabold",
                  currentValueToneClassName,
                ]
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
  const router = useGuardedRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const [holdings, setHoldings] = React.useState<PortfolioHolding[]>([]);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isBackupBusy, setIsBackupBusy] = React.useState(false);
  const [groupingMode, setGroupingMode] = React.useState<PortfolioGroupingMode>("companies");
  const [displayMode, setDisplayMode] = React.useState<PortfolioDisplayMode>("percentage");
  const [backupNotice, setBackupNotice] = React.useState<BackupNoticeState | null>(
    null
  );
  const [hasHydratedViewPreferences, setHasHydratedViewPreferences] =
    React.useState(false);
  const {
    isBackgroundSyncing,
    beginBackgroundSync,
    endBackgroundSync,
  } = useBackgroundSyncIndicator();
  const filterSheetRef = React.useRef<BottomSheetModal>(null);
  const filterSheetSnapPoints = React.useMemo(() => ["44%"], []);
  const sectorAggregates = React.useMemo(() => buildSectorAggregates(holdings), [holdings]);
  const totalInvested = React.useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.invested, 0),
    [holdings]
  );

  const refreshPortfolio = React.useCallback(async (
    preferCachedFirst = true,
    forceLive = false,
    showLoader = false
  ) => {
    let didStartBackgroundSync = false;
    if (showLoader) {
      setIsInitialLoading(true);
    }

    let hasUsableCachedHoldings = false;
    try {
      if (preferCachedFirst) {
        const cachedHoldings = await getPortfolioHoldingsWithCachedQuotes();
        setHoldings(cachedHoldings);
        hasUsableCachedHoldings =
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
      }

      let isMarketOpen = true;
      if (!forceLive) {
        try {
          const cachedMarketStatus = await getCachedDpsMarketStatus();
          isMarketOpen = cachedMarketStatus.uiStatus === "OPEN";
        } catch {
          isMarketOpen = true;
        }
      }

      const shouldFetchLiveQuotes =
        forceLive || isMarketOpen || !hasUsableCachedHoldings;
      if (!shouldFetchLiveQuotes) {
        return;
      }

      if (preferCachedFirst && hasUsableCachedHoldings && !showLoader) {
        beginBackgroundSync();
        didStartBackgroundSync = true;
      }

      const latestHoldings = await getPortfolioHoldingsWithLatestQuotes({
        forceLive,
      });
      setHoldings(latestHoldings);
    } finally {
      if (didStartBackgroundSync) {
        endBackgroundSync();
      }
      if (showLoader) {
        setIsInitialLoading(false);
      }
    }
  }, [beginBackgroundSync, endBackgroundSync]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshPortfolio(false, true);
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
    void refreshPortfolio(true, false, true);
    const intervalId = setInterval(() => {
      void refreshPortfolio(true);
    }, PORTFOLIO_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshPortfolio]);

  useFocusEffect(
    React.useCallback(() => {
      void refreshPortfolio(true);
    }, [refreshPortfolio])
  );

  React.useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshPortfolio(true);
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [refreshPortfolio]);

  React.useEffect(() => {
    const unsubscribe = subscribeToTradeMutations(() => {
      void refreshPortfolio(true);
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

  const handleCloseBackupNotice = React.useCallback(() => {
    setBackupNotice(null);
  }, []);

  const openFilterSheet = React.useCallback(() => {
    filterSheetRef.current?.present();
  }, []);

  const filterSheetBackdrop = React.useCallback(
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

  const handleExportBackup = React.useCallback(async () => {
    if (isBackupBusy) {
      return;
    }

    setIsBackupBusy(true);
    try {
      const exportSummary = await exportPortfolioWorkbookBackup();
      const sharingAvailable = await Sharing.isAvailableAsync();

      if (sharingAvailable) {
        await Sharing.shareAsync(exportSummary.fileUri, {
          mimeType: "application/vnd.ms-excel",
          dialogTitle: "Export Portfolio XLS Backup",
          UTI: "com.microsoft.excel.xls",
        });
      }

      setBackupNotice({
        title: "Backup Ready (.xls)",
        message: sharingAvailable
          ? `Backup file prepared with ${exportSummary.rows} rows.`
          : `Backup file saved at:\n${exportSummary.fileUri}`,
        tone: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unable to export backup right now.";
      setBackupNotice({
        title: "Export Failed",
        message,
        tone: "error",
      });
    } finally {
      setIsBackupBusy(false);
    }
  }, [isBackupBusy]);

  const handleImportBackup = React.useCallback(async () => {
    if (isBackupBusy) {
      return;
    }

    setIsBackupBusy(true);
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.ms-excel",
          "application/xls",
          "application/octet-stream",
          "public.plain-text",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (pickerResult.canceled) {
        return;
      }

      const selectedAsset = pickerResult.assets[0];
      if (!selectedAsset?.uri) {
        throw new Error("Selected file is not accessible.");
      }

      const importSummary = await importPortfolioWorkbookBackupFromFile(
        selectedAsset.uri
      );
      await refreshPortfolio();

      setBackupNotice({
        title: "Backup Imported",
        message: [
          `Trades: ${importSummary.trades}`,
          `Deposits: ${importSummary.deposits}`,
          `Dividends: ${importSummary.dividends}`,
          `Bonus Shares: ${importSummary.bonuses}`,
        ].join("\n"),
        tone: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unable to import backup.";
      setBackupNotice({
        title: "Import Failed",
        message,
        tone: "error",
      });
    } finally {
      setIsBackupBusy(false);
    }
  }, [isBackupBusy, refreshPortfolio]);

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
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                activeOpacity={0.88}
                disabled={isBackupBusy}
                onPress={handleExportBackup}
                className={[
                  "rounded-xl bg-app-highlight/10 px-3 py-2 dark:bg-brand-white/10",
                  isBackupBusy ? "opacity-50" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Text className="text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                  Export
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                disabled={isBackupBusy}
                onPress={handleImportBackup}
                className={[
                  "rounded-xl bg-app-highlight/10 px-3 py-2 dark:bg-brand-white/10",
                  isBackupBusy ? "opacity-50" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Text className="text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                  Import
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={openFilterSheet}
                className="h-[40px] w-[40px] items-center justify-center rounded-xl bg-app-highlight/10 dark:bg-brand-white/10"
              >
                <MaterialCommunityIcons
                  name={
                    groupingMode !== "companies" || displayMode !== "percentage"
                      ? "filter-check-outline"
                      : "filter-variant"
                  }
                  size={20}
                  color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row items-center justify-end">
            <AppBackgroundRefreshIndicator
              visible={isBackgroundSyncing}
              label="Refreshing"
            />
          </View>

          {isInitialLoading ? (
            <View className="gap-3">
              <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/30 dark:bg-brand-white/10">
                <AppSkeletonBlock width="36%" height={12} borderRadius={7} />
                <AppSkeletonBlock
                  className="mt-3"
                  width="100%"
                  height={36}
                  borderRadius={12}
                />
              </View>
              <AppListScreenSkeleton cardCount={4} />
            </View>
          ) : holdings.length === 0 ? (
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

      <AppFeedbackModal
        visible={backupNotice !== null}
        title={backupNotice?.title ?? ""}
        message={backupNotice?.message ?? ""}
        tone={backupNotice?.tone ?? "info"}
        onClose={handleCloseBackupNotice}
      />

      <BottomSheetModal
        ref={filterSheetRef}
        snapPoints={filterSheetSnapPoints}
        enablePanDownToClose
        backdropComponent={filterSheetBackdrop}
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
            Portfolio Filters
          </Text>

          <View className="mt-4 rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/12 dark:bg-brand-white/10">
            <Text className="text-[11px] font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
              Group By (select one)
            </Text>
            <View className="mt-2 gap-2">
              <FilterRowOption
                label="Sectors"
                selected={groupingMode === "sectors"}
                onPress={() => setGroupingMode("sectors")}
              />
              <FilterRowOption
                label="Companies"
                selected={groupingMode === "companies"}
                onPress={() => setGroupingMode("companies")}
              />
            </View>

            <Text className="mt-4 text-[11px] font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
              Value Mode (select one)
            </Text>
            <View className="mt-2 gap-2">
              <FilterRowOption
                label="Percentage"
                selected={displayMode === "percentage"}
                onPress={() => setDisplayMode("percentage")}
              />
              <FilterRowOption
                label="Price"
                selected={displayMode === "price"}
                onPress={() => setDisplayMode("price")}
              />
            </View>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
