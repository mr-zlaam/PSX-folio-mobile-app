import AppBackgroundRefreshIndicator from "@/components/ui/app-background-refresh-indicator";
import AppButton from "@/components/ui/app-button";
import AppFeedbackModal, {
  AppFeedbackModalTone,
} from "@/components/ui/app-feedback-modal";
import ShariahChip from "@/components/ui/shariah-chip";
import {
  BonusShareRecord,
  getSavedBonusShareRecords,
} from "@/src/features/bonus-share/bonus-share-records";
import { getTotalDepositAmount } from "@/src/features/deposit/deposit-records";
import { syncAutoDividendsFromNotifications } from "@/src/features/dividend/auto-dividend-sync";
import { getTotalDividendFinalAmount } from "@/src/features/dividend/dividend-records";
import { InsightDisplayMode } from "@/src/features/home/home-data";
import {
  formatCompactPKRAmount,
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import {
  buildHomeSnapshotFromHoldings,
  DEFAULT_INSIGHT_DISPLAY_VALUES,
  InsightDisplayValues,
} from "@/src/features/home/home-portfolio-snapshot";
import { buildHomeViewModel } from "@/src/features/home/home-view-model";
import { ValueTone } from "@/src/features/home/types";
import {
  DpsMarketStatusSnapshot,
  getCachedDpsMarketStatus,
  getLatestDpsMarketStatus,
} from "@/src/features/market/dps-market-status";
import {
  getCachedMarketIndexDetail,
  getLatestMarketIndexDetail,
} from "@/src/features/market/market-data";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  getUnreadInAppNotificationCount,
  subscribeToInAppNotifications,
  syncPsxAnnouncementsToInAppNotifications,
} from "@/src/features/notifications/in-app-notifications";
import {
  getPortfolioHoldingsWithCachedQuotes,
  PortfolioHolding,
  streamLatestPortfolioHoldings,
} from "@/src/features/portfolio/portfolio-data";
import { getAllPositionSnapshots } from "@/src/features/portfolio/position-ledger";
import { calculateRealizedProfitLoss } from "@/src/features/portfolio/realized-pnl";

import { subscribeToTradeMutations } from "@/src/features/trade/trade-events";
import {
  getSavedTradeOrders,
  TradeOrderRecord,
} from "@/src/features/trade/trade-orders";
import {
  getAllTimeHighPortfolioWorthPreference,
  getHomeInsightDisplayModePreference,
  setAllTimeHighPortfolioWorthPreference,
  setHomeInsightDisplayModePreference,
} from "@/src/lib/app-preferences";
import { calculateBrokerFeeAmount } from "@/src/lib/broker-fee";
import { useGuardedRouter } from "@/src/lib/navigation";
import { isInternetReachable } from "@/src/lib/network";
import { useBackgroundSyncIndicator } from "@/src/lib/use-background-sync-indicator";
import { APP_COLORS } from "@/src/theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { useColorScheme } from "nativewind";
import React from "react";
import {
  Animated,
  AppState,
  Easing,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const HOME_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type HomeNoticeState = {
  title: string;
  message: string;
  tone: AppFeedbackModalTone;
};

function getToneClassName(tone: ValueTone): string {
  if (tone === "positive") {
    return "text-success-green";
  }

  if (tone === "negative") {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function getInsightValueClassName(valueText: string): string {
  const normalizedValue = valueText.trim();

  if (normalizedValue.startsWith("+")) {
    return "text-success-green";
  }

  if (normalizedValue.startsWith("-")) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function formatSignedPkrAmount(value: number): string {
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

function getSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

function isCompactPkrValue(
  value: number,
  options?: {
    compactFrom?: number;
  },
): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }

  const compactFrom = options?.compactFrom ?? 100_000;
  return Math.abs(value) >= compactFrom;
}

function formatSignedCompactPkrAmount(
  value: number,
  options?: {
    compactFrom?: number;
  },
): string {
  if (!Number.isFinite(value)) {
    return "PKR 0";
  }

  const absoluteCompactText = formatCompactPKRAmount(Math.abs(value), options);
  if (value > 0) {
    return `+${absoluteCompactText}`;
  }

  if (value < 0) {
    return `-${absoluteCompactText}`;
  }

  return formatCompactPKRAmount(0, options);
}

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return "--";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "--";
  }

  return parsedDate.toLocaleString("en-PK", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAKISTAN_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getPakistanDayKey(value: string | Date): string | null {
  const parsedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return PAKISTAN_DAY_FORMATTER.format(parsedDate);
}

function toEventTimestamp(primaryDate: string, fallbackDate: string): number {
  const primaryTimestamp = new Date(primaryDate).getTime();
  if (Number.isFinite(primaryTimestamp)) {
    return primaryTimestamp;
  }

  const fallbackTimestamp = new Date(fallbackDate).getTime();
  if (Number.isFinite(fallbackTimestamp)) {
    return fallbackTimestamp;
  }

  return 0;
}

function getCarryUnitsBySymbolBeforeToday(
  tradeOrders: TradeOrderRecord[],
  bonusShareRecords: BonusShareRecord[],
): Map<string, number> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayTimestamp = startOfToday.getTime();

  const ordersBeforeToday = tradeOrders.filter((order) => {
    const eventTimestamp = toEventTimestamp(order.tradedAt, order.createdAt);
    return eventTimestamp > 0 && eventTimestamp < startOfTodayTimestamp;
  });

  const bonusesBeforeToday = bonusShareRecords.filter((record) => {
    const eventTimestamp = toEventTimestamp(record.awardedAt, record.createdAt);
    return eventTimestamp > 0 && eventTimestamp < startOfTodayTimestamp;
  });

  const carrySnapshots = getAllPositionSnapshots(
    ordersBeforeToday,
    bonusesBeforeToday,
  );
  return new Map(
    carrySnapshots.map((snapshot) => [snapshot.symbol, snapshot.units]),
  );
}

type HeaderActionButtonProps = {
  label: string;
  selected: boolean;
  tone?: "default" | "danger";
  onPress: () => void;
};

function HeaderActionButton({
  label,
  selected,
  tone = "default",
  onPress,
}: HeaderActionButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className={[
        "rounded-xl border px-3 py-1.5",
        selected
          ? tone === "danger"
            ? "border-brand-red bg-brand-red dark:border-brand-red dark:bg-brand-red"
            : "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
          : "border-app-highlight bg-button-neutral dark:border-app-highlightDark dark:bg-transparent",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-xs font-bold",
          selected
            ? tone === "danger"
              ? "text-brand-white"
              : "text-brand-white dark:text-brand-purple"
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useGuardedRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const initialHomeData = React.useMemo(
    () => buildHomeSnapshotFromHoldings([]),
    [],
  );
  const [insightMode, setInsightMode] =
    React.useState<InsightDisplayMode>("percentage");
  const [viewModel, setViewModel] = React.useState(() =>
    buildHomeViewModel(initialHomeData.snapshot),
  );
  const [insightDisplayValues, setInsightDisplayValues] =
    React.useState<InsightDisplayValues>(DEFAULT_INSIGHT_DISPLAY_VALUES);
  const [totalDividendValue, setTotalDividendValue] = React.useState(0);
  const [realizedProfitLoss, setRealizedProfitLoss] = React.useState(0);
  const [investedAmount, setInvestedAmount] = React.useState(0);
  const [totalProfitAmount, setTotalProfitAmount] = React.useState(0);
  const [totalReturnPct, setTotalReturnPct] = React.useState(0);
  const [currentPortfolioWorth, setCurrentPortfolioWorth] = React.useState(0);
  const [todayWorthChange, setTodayWorthChange] = React.useState(0);
  const [todayWorthChangePct, setTodayWorthChangePct] = React.useState(0);
  const [totalBrokerDeductionAmount, setTotalBrokerDeductionAmount] =
    React.useState(0);
  const [allTimeHighWorth, setAllTimeHighWorth] = React.useState(0);
  const [marketAsOf, setMarketAsOf] = React.useState<string | null>(null);
  const [dpsMarketStatus, setDpsMarketStatus] =
    React.useState<DpsMarketStatusSnapshot>({
      primaryBoardKey: null,
      primaryBoardTitle: null,
      stateText: "CLOSED",
      uiStatus: "CLOSED",
      boards: [],
      fetchedAt: null,
      source: "fallback",
    });
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [streamProgress, setStreamProgress] = React.useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [noticeState, setNoticeState] = React.useState<HomeNoticeState | null>(
    null,
  );
  const [unreadNotificationsCount, setUnreadNotificationsCount] =
    React.useState(0);
  const [hasHydratedInsightMode, setHasHydratedInsightMode] =
    React.useState(false);
  const [isPortfolioWorthTooltipVisible, setIsPortfolioWorthTooltipVisible] =
    React.useState(false);
  const [activeMetricTooltipKey, setActiveMetricTooltipKey] = React.useState<
    "invested" | "totalPl" | "todayPl" | "realizedPl" | null
  >(null);
  const openPulseAnim = React.useRef(new Animated.Value(0)).current;
  const homeRefreshRequestIdRef = React.useRef(0);
  const portfolioWorthTooltipTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const metricTooltipTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const { isBackgroundSyncing } =
    useBackgroundSyncIndicator();

  const handleTradePress = React.useCallback(() => {
    router.push({
      pathname: "/(tabs)/transactions",
      params: {
        lockSymbol: "0",
        originTab: "home",
      },
    });
  }, [router]);

  const handleOpenPortfolio = React.useCallback(() => {
    router.push("/(tabs)/portfolio");
  }, [router]);

  const handleOpenTransactionHistory = React.useCallback(() => {
    router.push("/transaction-history");
  }, [router]);

  const handleOpenNotifications = React.useCallback(() => {
    router.push("/notifications");
  }, [router]);

  const showNotice = React.useCallback(
    (title: string, message: string, tone: AppFeedbackModalTone = "info") => {
      setNoticeState({ title, message, tone });
    },
    [],
  );

  const closeNotice = React.useCallback(() => {
    setNoticeState(null);
  }, []);

  const applyHomeSnapshot = React.useCallback(
    (
      holdings: PortfolioHolding[],
      totalDividendValue: number,
      totalDepositValue: number,
      allTimeHighWorthBaseline: number,
      carryUnitsBySymbol: Map<string, number>,
    ): number => {
      const nextHomeData = buildHomeSnapshotFromHoldings(holdings, {
        contributedCapitalAdjustment: totalDepositValue,
        returnCashAdjustment: totalDividendValue,
      });
      const nextPortfolioWorth = nextHomeData.snapshot.summary.value;
      const todayPakistanDayKey = getPakistanDayKey(new Date());
      const todayChange = holdings.reduce((runningTotal, holding) => {
        const quoteDayKey = getPakistanDayKey(holding.asOf ?? "");
        if (
          !todayPakistanDayKey ||
          !quoteDayKey ||
          quoteDayKey !== todayPakistanDayKey
        ) {
          return runningTotal;
        }

        const units = Number.isFinite(holding.units) ? holding.units : 0;
        const carryUnits = Math.min(
          units,
          getSafeNumber(carryUnitsBySymbol.get(holding.symbol), 0),
        );
        const currentPrice = Number.isFinite(holding.currentPrice)
          ? holding.currentPrice
          : 0;
        const previousClose =
          Number.isFinite(holding.previousClose) && holding.previousClose > 0
            ? holding.previousClose
            : currentPrice;

        return runningTotal + carryUnits * (currentPrice - previousClose);
      }, 0);
      const previousWorth = nextPortfolioWorth - todayChange;
      const todayChangePct =
        previousWorth > 0 ? (todayChange / previousWorth) * 100 : 0;
      const nextAllTimeHighWorth = Math.max(
        allTimeHighWorthBaseline,
        nextPortfolioWorth,
      );

      setCurrentPortfolioWorth(nextPortfolioWorth);
      setInvestedAmount(nextHomeData.snapshot.summary.invested);
      setTotalProfitAmount(nextHomeData.snapshot.summary.profit);
      setTotalReturnPct(nextHomeData.snapshot.summary.returnPct);
      setTodayWorthChange(todayChange);
      setTodayWorthChangePct(todayChangePct);
      setAllTimeHighWorth(nextAllTimeHighWorth);

      if (nextAllTimeHighWorth > allTimeHighWorthBaseline) {
        void setAllTimeHighPortfolioWorthPreference(nextAllTimeHighWorth);
      }

      setViewModel(buildHomeViewModel(nextHomeData.snapshot));
      setInsightDisplayValues(nextHomeData.insightDisplayValues);
      return nextAllTimeHighWorth;
    },
    [],
  );

  const refreshHomeSnapshot = React.useCallback(
    async (preferCachedFirst = true) => {
      const requestId = homeRefreshRequestIdRef.current + 1;
      homeRefreshRequestIdRef.current = requestId;

      try {
        const [
          totalDividendValue,
          totalDepositValue,
          storedAllTimeHighWorth,
          savedTradeOrders,
          savedBonusShareRecords,
        ] = await Promise.all([
          getTotalDividendFinalAmount(),
          getTotalDepositAmount(),
          getAllTimeHighPortfolioWorthPreference(),
          getSavedTradeOrders(),
          getSavedBonusShareRecords(),
        ]);
        if (requestId !== homeRefreshRequestIdRef.current) {
          return;
        }

        setTotalDividendValue(totalDividendValue);
        setRealizedProfitLoss(
          calculateRealizedProfitLoss(savedTradeOrders, savedBonusShareRecords),
        );
        setTotalBrokerDeductionAmount(
          savedTradeOrders.reduce((runningTotal, order) => {
            if (order.brokerDeductionEnabled === false) {
              return runningTotal;
            }

            const brokerDeduction = calculateBrokerFeeAmount({
              price: order.price,
              units: order.units,
              brokerFeeType: order.brokerFeeType,
              brokerFeeValue: order.brokerFeeValue,
              brokerFeePct:
                typeof order.brokerFeePct === "number"
                  ? order.brokerFeePct
                  : null,
              brokerCommissionModel: order.brokerCommissionModel,
              brokerCommissionRules: order.brokerCommissionRules,
              cdcChargePerShare: order.brokerCdcChargePerShare,
            });
            return runningTotal + brokerDeduction;
          }, 0),
        );
        const carryUnitsBySymbol = getCarryUnitsBySymbolBeforeToday(
          savedTradeOrders,
          savedBonusShareRecords,
        );
        let allTimeHighWorthBaseline = storedAllTimeHighWorth;
        setAllTimeHighWorth(allTimeHighWorthBaseline);

        if (preferCachedFirst) {
          const [cachedHoldings, cachedMarketDetail, cachedDpsStatus] =
            await Promise.all([
              getPortfolioHoldingsWithCachedQuotes(),
              getCachedMarketIndexDetail("KSE100"),
              getCachedDpsMarketStatus(),
            ]);
          if (requestId !== homeRefreshRequestIdRef.current) {
            return;
          }

          setMarketAsOf(cachedMarketDetail?.snapshot.asOf ?? null);
          setDpsMarketStatus(cachedDpsStatus);
          allTimeHighWorthBaseline = applyHomeSnapshot(
            cachedHoldings,
            totalDividendValue,
            totalDepositValue,
            allTimeHighWorthBaseline,
            carryUnitsBySymbol,
          );
        }

        const [latestMarketDetail, latestDpsStatus] = await Promise.all([
          getLatestMarketIndexDetail("KSE100"),
          getLatestDpsMarketStatus(),
        ]);
        if (requestId !== homeRefreshRequestIdRef.current) {
          return;
        }

        if (latestMarketDetail?.snapshot.asOf) {
          setMarketAsOf(latestMarketDetail.snapshot.asOf);
        }
        setDpsMarketStatus(latestDpsStatus);

        const latestHoldings = await new Promise<PortfolioHolding[]>(
          (resolve) => {
            streamLatestPortfolioHoldings(
              (update) => {
                setStreamProgress({
                  completed: update.completedCount,
                  total: update.totalCount,
                });
              },
              (holdings) => {
                setStreamProgress(null);
                resolve(holdings);
              },
            );
          },
        );
        if (requestId !== homeRefreshRequestIdRef.current) {
          return;
        }

        applyHomeSnapshot(
          latestHoldings,
          totalDividendValue,
          totalDepositValue,
          allTimeHighWorthBaseline,
          carryUnitsBySymbol,
        );

        void (async () => {
          try {
            await syncPsxAnnouncementsToInAppNotifications();
            const createdDividendTransactions =
              await syncAutoDividendsFromNotifications();
            if (createdDividendTransactions <= 0) {
              return;
            }

            const updatedDividendValue = await getTotalDividendFinalAmount();
            if (requestId !== homeRefreshRequestIdRef.current) {
              return;
            }

            setTotalDividendValue(updatedDividendValue);
            applyHomeSnapshot(
              latestHoldings,
              updatedDividendValue,
              totalDepositValue,
              allTimeHighWorthBaseline,
              carryUnitsBySymbol,
            );
          } catch {
            // Ignore background sync errors to keep the home screen responsive.
          }
        })();
      } finally {
        // Auto-refreshes update silently; pull-to-refresh uses its own indicator.
      }
    },
    [applyHomeSnapshot],
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const isOnline = await isInternetReachable();
      if (!isOnline) {
        showNotice(
          "You're Offline",
          "No internet connection detected. Connect to the internet and pull to refresh again.",
          "error",
        );
        return;
      }
      await refreshHomeSnapshot(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshHomeSnapshot, showNotice]);

  const refreshUnreadNotificationsCount = React.useCallback(async () => {
    const nextUnreadCount = await getUnreadInAppNotificationCount();
    setUnreadNotificationsCount(nextUnreadCount);
  }, []);

  React.useEffect(() => {
    void refreshUnreadNotificationsCount();

    const unsubscribe = subscribeToInAppNotifications(() => {
      void refreshUnreadNotificationsCount();
    });

    return unsubscribe;
  }, [refreshUnreadNotificationsCount]);

  React.useEffect(() => {
    let isMounted = true;

    async function hydrateInsightMode() {
      const savedInsightMode = await getHomeInsightDisplayModePreference();
      if (!isMounted) {
        return;
      }

      setInsightMode(savedInsightMode);
      setHasHydratedInsightMode(true);
    }

    void hydrateInsightMode();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!hasHydratedInsightMode) {
      return;
    }

    void setHomeInsightDisplayModePreference(insightMode);
  }, [hasHydratedInsightMode, insightMode]);

  React.useEffect(() => {
    void refreshHomeSnapshot();
    const intervalId = setInterval(() => {
      void refreshHomeSnapshot();
    }, HOME_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshHomeSnapshot]);

  React.useEffect(() => {
    const unsubscribe = subscribeToTradeMutations(() => {
      void refreshHomeSnapshot(true);
    });

    return unsubscribe;
  }, [refreshHomeSnapshot]);

  useFocusEffect(
    React.useCallback(() => {
      void refreshHomeSnapshot(true);
    }, [refreshHomeSnapshot]),
  );

  React.useEffect(() => {
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          void refreshHomeSnapshot(true);
        }
      },
    );

    return () => {
      appStateSubscription.remove();
    };
  }, [refreshHomeSnapshot]);

  const profitSummaryItem = React.useMemo(
    () => viewModel.summaryItems.find((item) => item.key === "profit"),
    [viewModel.summaryItems],
  );
  const valueSummaryItem = React.useMemo(
    () => viewModel.summaryItems.find((item) => item.key === "value"),
    [viewModel.summaryItems],
  );
  const isPortfolioWorthCompact = Math.abs(currentPortfolioWorth) >= 100_000;
  const displayPortfolioWorth = React.useMemo(
    () =>
      formatCompactPKRAmount(currentPortfolioWorth, { compactFrom: 100_000 }),
    [currentPortfolioWorth],
  );
  const fullPortfolioWorth = React.useMemo(
    () => formatPKRAmount(currentPortfolioWorth),
    [currentPortfolioWorth],
  );
  const totalProfitWithPercentageText = React.useMemo(() => {
    const returnText = formatSignedPercentage(totalReturnPct);
    const compactAmountText = isCompactPkrValue(totalProfitAmount)
      ? formatSignedCompactPkrAmount(totalProfitAmount, {
          compactFrom: 100_000,
        })
      : formatSignedPkrAmount(totalProfitAmount);
    return `${compactAmountText} (${returnText})`;
  }, [totalProfitAmount, totalReturnPct]);
  const totalProfitFullText = React.useMemo(
    () =>
      `${formatSignedPkrAmount(totalProfitAmount)} (${formatSignedPercentage(
        totalReturnPct,
      )})`,
    [totalProfitAmount, totalReturnPct],
  );
  const investedDisplayText = React.useMemo(
    () =>
      isCompactPkrValue(investedAmount)
        ? formatCompactPKRAmount(investedAmount, { compactFrom: 100_000 })
        : formatPKRAmount(investedAmount),
    [investedAmount],
  );
  const todayProfitDisplayText = React.useMemo(() => {
    const compactAmountText = isCompactPkrValue(todayWorthChange)
      ? formatSignedCompactPkrAmount(todayWorthChange, { compactFrom: 100_000 })
      : formatSignedPkrAmount(todayWorthChange);
    return `${compactAmountText} (${formatSignedPercentage(todayWorthChangePct)})`;
  }, [todayWorthChange, todayWorthChangePct]);
  const todayProfitFullText = React.useMemo(
    () =>
      `${formatSignedPkrAmount(todayWorthChange)} (${formatSignedPercentage(
        todayWorthChangePct,
      )})`,
    [todayWorthChange, todayWorthChangePct],
  );
  const realizedProfitLossText = React.useMemo(
    () =>
      isCompactPkrValue(realizedProfitLoss)
        ? formatSignedCompactPkrAmount(realizedProfitLoss, {
            compactFrom: 100_000,
          })
        : formatSignedPkrAmount(realizedProfitLoss),
    [realizedProfitLoss],
  );
  const realizedProfitLossFullText = React.useMemo(
    () => formatSignedPkrAmount(realizedProfitLoss),
    [realizedProfitLoss],
  );
  const realizedProfitLossTone = React.useMemo(() => {
    if (realizedProfitLoss > 0) {
      return "positive";
    }

    if (realizedProfitLoss < 0) {
      return "negative";
    }

    return "neutral";
  }, [realizedProfitLoss]);
  const allTimeHighWorthText = React.useMemo(
    () => formatPKRAmount(allTimeHighWorth),
    [allTimeHighWorth],
  );
  const totalBrokerDeductionText = React.useMemo(
    () => formatPKRAmount(totalBrokerDeductionAmount),
    [totalBrokerDeductionAmount],
  );
  const todayWorthChangeTone = React.useMemo(() => {
    if (todayWorthChange > 0) {
      return "positive";
    }

    if (todayWorthChange < 0) {
      return "negative";
    }

    return "neutral";
  }, [todayWorthChange]);
  const marketStatusLabel = dpsMarketStatus.stateText;
  const marketStatusTextClassName =
    dpsMarketStatus.uiStatus === "OPEN"
      ? "text-success-green"
      : "text-brand-red";
  const isMarketOpen = dpsMarketStatus.uiStatus === "OPEN";
  const statusDotColor = isMarketOpen
    ? APP_COLORS.success.green
    : APP_COLORS.brand.red;
  const pulseScale = openPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.4],
  });
  const pulseOpacity = openPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.34, 0],
  });

  React.useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;

    if (isMarketOpen) {
      openPulseAnim.setValue(0);
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(openPulseAnim, {
            toValue: 1,
            duration: 980,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(openPulseAnim, {
            toValue: 0,
            duration: 220,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
    } else {
      openPulseAnim.stopAnimation();
      openPulseAnim.setValue(0);
    }

    return () => {
      animation?.stop();
    };
  }, [isMarketOpen, openPulseAnim]);

  React.useEffect(() => {
    return () => {
      if (portfolioWorthTooltipTimeoutRef.current) {
        clearTimeout(portfolioWorthTooltipTimeoutRef.current);
      }
      if (metricTooltipTimeoutRef.current) {
        clearTimeout(metricTooltipTimeoutRef.current);
      }
    };
  }, []);

  const handlePortfolioWorthPress = React.useCallback(() => {
    if (!isPortfolioWorthCompact) {
      return;
    }

    setIsPortfolioWorthTooltipVisible(true);
    if (portfolioWorthTooltipTimeoutRef.current) {
      clearTimeout(portfolioWorthTooltipTimeoutRef.current);
    }

    portfolioWorthTooltipTimeoutRef.current = setTimeout(() => {
      setIsPortfolioWorthTooltipVisible(false);
    }, 2000);
  }, [isPortfolioWorthCompact]);

  const showMetricTooltip = React.useCallback(
    (metricKey: "invested" | "totalPl" | "todayPl" | "realizedPl") => {
      setActiveMetricTooltipKey(metricKey);
      if (metricTooltipTimeoutRef.current) {
        clearTimeout(metricTooltipTimeoutRef.current);
      }

      metricTooltipTimeoutRef.current = setTimeout(() => {
        setActiveMetricTooltipKey((currentValue) =>
          currentValue === metricKey ? null : currentValue,
        );
      }, 2000);
    },
    [],
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
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor={
              isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple
            }
            colors={[
              isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple,
            ]}
            progressBackgroundColor={
              isDarkMode ? APP_COLORS.brand.purple : APP_COLORS.brand.white
            }
          />
        }
      >
        <View className="gap-7">
          <View className="flex-row items-center justify-between">
            <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
              PSX <Text className="text-red-600">Folio</Text>
            </Text>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleOpenNotifications}
              className="relative h-11 w-11 items-center justify-center"
            >
              <MaterialCommunityIcons
                name="bell-outline"
                size={22}
                color={
                  isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple
                }
              />

              {unreadNotificationsCount > 0 ? (
                <View className="absolute -right-1 -top-1 min-h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1">
                  <Text className="text-[10px] font-bold text-brand-white">
                    {unreadNotificationsCount > 99
                      ? "99+"
                      : String(unreadNotificationsCount)}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                Current Portfolio Worth
              </Text>

              <View className="items-end">
                <View className="flex-row items-center">
                  <View className="mr-1.5 h-3.5 w-3.5 items-center justify-center">
                    {isMarketOpen ? (
                      <Animated.View
                        style={{
                          position: "absolute",
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          backgroundColor: statusDotColor,
                          opacity: pulseOpacity,
                          transform: [{ scale: pulseScale }],
                        }}
                      />
                    ) : null}
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: statusDotColor,
                      }}
                    />
                  </View>
                  <Text
                    className={[
                      "text-xs font-bold uppercase tracking-wide",
                      marketStatusTextClassName,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {marketStatusLabel}
                  </Text>
                </View>
              </View>
            </View>
            <View className="relative mt-2 self-start">
              {isPortfolioWorthTooltipVisible && isPortfolioWorthCompact ? (
                <View className="absolute -top-9 left-0 z-20 rounded-lg bg-app-highlight px-2.5 py-1.5 dark:bg-brand-white/90">
                  <Text className="text-[11px] font-semibold text-brand-white dark:text-brand-purple">
                    {fullPortfolioWorth}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity
                activeOpacity={isPortfolioWorthCompact ? 0.82 : 1}
                disabled={!isPortfolioWorthCompact}
                onPress={handlePortfolioWorthPress}
              >
                <Text
                  className={[
                    "text-4xl font-extrabold",
                    getToneClassName(valueSummaryItem?.tone ?? "neutral"),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {displayPortfolioWorth}
                </Text>
              </TouchableOpacity>
            </View>
            <View className="mt-3 overflow-hidden rounded-3xl bg-app-highlight/8 px-3 py-3 dark:bg-brand-white/5">
              <View className="flex-row flex-wrap">
                <View className="w-1/2 pb-3 pr-2">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Invested
                  </Text>
                  <View className="relative mt-1 self-start">
                    {activeMetricTooltipKey === "invested" &&
                    isCompactPkrValue(investedAmount) ? (
                      <View className="absolute -top-9 left-0 z-20 rounded-lg bg-app-highlight px-2.5 py-1.5 dark:bg-brand-white/90">
                        <Text className="text-[11px] font-semibold text-brand-white dark:text-brand-purple">
                          {formatPKRAmount(investedAmount)}
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      activeOpacity={
                        isCompactPkrValue(investedAmount) ? 0.82 : 1
                      }
                      disabled={!isCompactPkrValue(investedAmount)}
                      onPress={() => showMetricTooltip("invested")}
                    >
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {investedDisplayText}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="w-1/2 pb-3 pl-2">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Total P/L
                  </Text>
                  <View className="relative mt-1 self-start">
                    {activeMetricTooltipKey === "totalPl" &&
                    isCompactPkrValue(totalProfitAmount) ? (
                      <View className="absolute -top-9 left-0 z-20 rounded-lg bg-app-highlight px-2.5 py-1.5 dark:bg-brand-white/90">
                        <Text className="text-[11px] font-semibold text-brand-white dark:text-brand-purple">
                          {totalProfitFullText}
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      activeOpacity={
                        isCompactPkrValue(totalProfitAmount) ? 0.82 : 1
                      }
                      disabled={!isCompactPkrValue(totalProfitAmount)}
                      onPress={() => showMetricTooltip("totalPl")}
                    >
                      <Text
                        className={[
                          "text-sm font-bold",
                          getToneClassName(
                            profitSummaryItem?.tone ?? "neutral",
                          ),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {totalProfitWithPercentageText}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="w-1/2 pr-2">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Today P/L
                  </Text>
                  <View className="relative mt-1 self-start">
                    {activeMetricTooltipKey === "todayPl" &&
                    isCompactPkrValue(todayWorthChange) ? (
                      <View className="absolute -top-9 left-0 z-20 rounded-lg bg-app-highlight px-2.5 py-1.5 dark:bg-brand-white/90">
                        <Text className="text-[11px] font-semibold text-brand-white dark:text-brand-purple">
                          {todayProfitFullText}
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      activeOpacity={
                        isCompactPkrValue(todayWorthChange) ? 0.82 : 1
                      }
                      disabled={!isCompactPkrValue(todayWorthChange)}
                      onPress={() => showMetricTooltip("todayPl")}
                    >
                      <Text
                        className={[
                          "text-sm font-bold",
                          getToneClassName(todayWorthChangeTone),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {todayProfitDisplayText}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="w-1/2 pl-2">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Realized P/L
                  </Text>
                  <View className="relative mt-1 self-start">
                    {activeMetricTooltipKey === "realizedPl" &&
                    isCompactPkrValue(realizedProfitLoss) ? (
                      <View className="absolute -top-9 left-0 z-20 rounded-lg bg-app-highlight px-2.5 py-1.5 dark:bg-brand-white/90">
                        <Text className="text-[11px] font-semibold text-brand-white dark:text-brand-purple">
                          {realizedProfitLossFullText}
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      activeOpacity={
                        isCompactPkrValue(realizedProfitLoss) ? 0.82 : 1
                      }
                      disabled={!isCompactPkrValue(realizedProfitLoss)}
                      onPress={() => showMetricTooltip("realizedPl")}
                    >
                      <Text
                        className={[
                          "text-sm font-bold",
                          getToneClassName(realizedProfitLossTone),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {realizedProfitLossText}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
            <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
              All-Time High: {allTimeHighWorthText}
            </Text>
            <Text className="mt-1 text-sm font-semibold text-success-green">
              Dividend: {formatPKRAmount(totalDividendValue)}
            </Text>
            <Text className="mt-1 text-xs font-semibold text-brand-red text-end">
              Broker Deduction: {totalBrokerDeductionText}
            </Text>

            <View className="mt-2 flex-row items-center justify-end">
              {streamProgress ? (
                <Text className="text-[9px] font-semibold text-text-light dark:text-text-dark">
                  Updating {streamProgress.completed} of {streamProgress.total}
                </Text>
              ) : isBackgroundSyncing ? (
                <AppBackgroundRefreshIndicator visible label="Refreshing" />
              ) : (
                <View className="flex-row items-center gap-1">
                  <MaterialCommunityIcons
                    name="update"
                    style={{ transform: [{ rotate: "45deg" }] }}
                    size={10}
                    color={
                      isDarkMode
                        ? APP_COLORS.brand.white
                        : APP_COLORS.brand.purple
                    }
                  />
                  <Text className="text-[9px] font-semibold text-text-light dark:text-text-dark">
                    Updated {formatUpdatedAt(marketAsOf)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <AppButton
                label="Trade"
                variant="danger"
                size="sm"
                onPress={handleTradePress}
              />
            </View>
            <View className="flex-1">
              <AppButton
                label="Transactions"
                variant="secondary"
                size="sm"
                onPress={handleOpenTransactionHistory}
              />
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.94}
            onPress={handleOpenPortfolio}
            className="rounded-3xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
          >
            <View className="flex-row items-center justify-between gap-3">
              <View className="self-start rounded-xl bg-app-highlight px-3 py-2 dark:bg-app-highlightDark">
                <Text className="text-xs font-bold uppercase tracking-wider text-brand-white dark:text-brand-purple">
                  Quick Insights
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <HeaderActionButton
                  label="Percentage"
                  selected={insightMode === "percentage"}
                  onPress={() => setInsightMode("percentage")}
                />
                <HeaderActionButton
                  label="Price"
                  selected={insightMode === "price"}
                  onPress={() => setInsightMode("price")}
                />
              </View>
            </View>

            <View className="mt-4 gap-3">
              {viewModel.insights.map((insight) => {
                const displayValues = insightDisplayValues[insight.label];
                const displayValue =
                  insightMode === "price"
                    ? (displayValues?.price ?? insight.valueText)
                    : (displayValues?.percentage ?? insight.valueText);

                return (
                  <View
                    key={insight.label}
                    className="flex-row items-center justify-between rounded-2xl bg-app-highlight/5 px-4 py-3 dark:bg-brand-white/5"
                  >
                    <View className="mr-3 flex-1">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        {insight.label}
                      </Text>
                      <View className="mt-1 flex-row items-center gap-2">
                        <Text className="text-base font-bold text-app-text dark:text-app-textDark">
                          {insight.symbol}
                        </Text>
                        {isShariahCompliantSymbol(insight.symbol) ? (
                          <ShariahChip compact />
                        ) : null}
                      </View>
                    </View>

                    <Text
                      className={[
                        "text-sm font-semibold",
                        getInsightValueClassName(displayValue),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {displayValue}
                    </Text>
                  </View>
                );
              })}
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <AppFeedbackModal
        visible={noticeState !== null}
        title={noticeState?.title ?? ""}
        message={noticeState?.message ?? ""}
        tone={noticeState?.tone ?? "info"}
        actionLabel="OK"
        onClose={closeNotice}
      />
    </SafeAreaView>
  );
}
