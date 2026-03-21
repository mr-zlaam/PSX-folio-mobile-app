import AppButton from "@/components/ui/app-button";
import { useGuardedRouter } from "@/src/lib/navigation";
import AppFeedbackModal, {
  AppFeedbackModalTone,
} from "@/components/ui/app-feedback-modal";
import ShariahChip from "@/components/ui/shariah-chip";
import { getTotalDepositAmount } from "@/src/features/deposit/deposit-records";
import { getTotalDividendFinalAmount } from "@/src/features/dividend/dividend-records";
import { InsightDisplayMode } from "@/src/features/home/home-data";
import {
  formatCompactPKRAmount,
  formatPKRAmount,
} from "@/src/features/home/home-formatters";
import {
  buildHomeSnapshotFromHoldings,
  DEFAULT_INSIGHT_DISPLAY_VALUES,
  InsightDisplayValues,
} from "@/src/features/home/home-portfolio-snapshot";
import { buildHomeViewModel } from "@/src/features/home/home-view-model";
import { ValueTone } from "@/src/features/home/types";
import {
  getCachedMarketIndexDetail,
  getLatestMarketIndexDetail,
} from "@/src/features/market/market-data";
import {
  getCachedDpsMarketStatus,
  getLatestDpsMarketStatus,
  DpsMarketStatusSnapshot,
} from "@/src/features/market/dps-market-status";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
  PortfolioHolding,
} from "@/src/features/portfolio/portfolio-data";
import { getCashLedgerSnapshot } from "@/src/features/trade/cash-ledger";
import { subscribeToTradeMutations } from "@/src/features/trade/trade-events";
import {
  getCashGuardEnabledPreference,
  getHomeInsightDisplayModePreference,
  setHomeInsightDisplayModePreference,
} from "@/src/lib/app-preferences";
import {
  getUnreadInAppNotificationCount,
  subscribeToInAppNotifications,
  syncPsxAnnouncementsToInAppNotifications,
} from "@/src/features/notifications/in-app-notifications";
import { isInternetReachable } from "@/src/lib/network";
import { APP_COLORS } from "@/src/theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { useColorScheme } from "nativewind";
import React from "react";
import {
  Animated,
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
  const [cashGuardEnabled, setCashGuardEnabled] = React.useState(false);
  const [availableFreeCash, setAvailableFreeCash] = React.useState(0);
  const [currentPortfolioWorth, setCurrentPortfolioWorth] = React.useState(0);
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
  const [noticeState, setNoticeState] = React.useState<HomeNoticeState | null>(
    null,
  );
  const [unreadNotificationsCount, setUnreadNotificationsCount] =
    React.useState(0);
  const [hasHydratedInsightMode, setHasHydratedInsightMode] =
    React.useState(false);
  const [isPortfolioWorthTooltipVisible, setIsPortfolioWorthTooltipVisible] =
    React.useState(false);
  const openPulseAnim = React.useRef(new Animated.Value(0)).current;
  const homeRefreshRequestIdRef = React.useRef(0);
  const portfolioWorthTooltipTimeoutRef = React.useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

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
    ) => {
      const nextHomeData = buildHomeSnapshotFromHoldings(holdings, {
        contributedCapitalAdjustment: totalDepositValue,
        returnCashAdjustment: totalDividendValue,
      });
      setCurrentPortfolioWorth(nextHomeData.snapshot.summary.value);
      setViewModel(buildHomeViewModel(nextHomeData.snapshot));
      setInsightDisplayValues(nextHomeData.insightDisplayValues);
    },
    [],
  );

  const refreshHomeSnapshot = React.useCallback(async () => {
    const requestId = homeRefreshRequestIdRef.current + 1;
    homeRefreshRequestIdRef.current = requestId;

    const [
      cachedHoldings,
      totalDividendValue,
      totalDepositValue,
      isCashGuardEnabled,
      cashLedgerSnapshot,
      cachedMarketDetail,
      cachedDpsStatus,
    ] = await Promise.all([
      getPortfolioHoldingsWithCachedQuotes(),
      getTotalDividendFinalAmount(),
      getTotalDepositAmount(),
      getCashGuardEnabledPreference(),
      getCashLedgerSnapshot(),
      getCachedMarketIndexDetail("KSE100"),
      getCachedDpsMarketStatus(),
    ]);
    if (requestId !== homeRefreshRequestIdRef.current) {
      return;
    }

    setTotalDividendValue(totalDividendValue);
    setCashGuardEnabled(isCashGuardEnabled);
    setAvailableFreeCash(cashLedgerSnapshot.availableCash);
    setMarketAsOf(cachedMarketDetail?.snapshot.asOf ?? null);
    setDpsMarketStatus(cachedDpsStatus);
    applyHomeSnapshot(cachedHoldings, totalDividendValue, totalDepositValue);

    const [latestHoldings, latestMarketDetail, latestDpsStatus] = await Promise.all([
      getPortfolioHoldingsWithLatestQuotes(),
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
    applyHomeSnapshot(latestHoldings, totalDividendValue, totalDepositValue);

    void syncPsxAnnouncementsToInAppNotifications();
  }, [applyHomeSnapshot]);

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
      await refreshHomeSnapshot();
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
      void refreshHomeSnapshot();
    });

    return unsubscribe;
  }, [refreshHomeSnapshot]);

  useFocusEffect(
    React.useCallback(() => {
      void refreshHomeSnapshot();
    }, [refreshHomeSnapshot]),
  );

  const profitSummaryItem = React.useMemo(
    () => viewModel.summaryItems.find((item) => item.key === "profit"),
    [viewModel.summaryItems],
  );
  const investedSummaryItem = React.useMemo(
    () => viewModel.summaryItems.find((item) => item.key === "invested"),
    [viewModel.summaryItems],
  );
  const valueSummaryItem = React.useMemo(
    () => viewModel.summaryItems.find((item) => item.key === "value"),
    [viewModel.summaryItems],
  );
  const returnSummaryItem = React.useMemo(
    () => viewModel.summaryItems.find((item) => item.key === "returnPct"),
    [viewModel.summaryItems],
  );
  const isPortfolioWorthCompact = Math.abs(currentPortfolioWorth) >= 100_000;
  const displayPortfolioWorth = React.useMemo(
    () => formatCompactPKRAmount(currentPortfolioWorth, { compactFrom: 100_000 }),
    [currentPortfolioWorth],
  );
  const fullPortfolioWorth = React.useMemo(
    () => formatPKRAmount(currentPortfolioWorth),
    [currentPortfolioWorth],
  );
  const freeCashText = React.useMemo(() => {
    if (!cashGuardEnabled) {
      return "Unlimited";
    }
    return formatPKRAmount(availableFreeCash);
  }, [availableFreeCash, cashGuardEnabled]);
  const marketStatusLabel = dpsMarketStatus.stateText;
  const marketStatusTextClassName =
    dpsMarketStatus.uiStatus === "OPEN" ? "text-success-green" : "text-brand-red";
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
                color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
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
            <Text
              className={[
                "mt-1 text-sm font-semibold",
                getToneClassName(profitSummaryItem?.tone ?? "neutral"),
              ]
                .filter(Boolean)
                .join(" ")}
            >
              Profit: {profitSummaryItem?.value ?? "PKR 0"}
            </Text>
            <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
              Invested: {investedSummaryItem?.value ?? "PKR 0"}
            </Text>
            <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
              Return: {returnSummaryItem?.value ?? "0.0%"}
            </Text>
            <Text className="mt-1 text-sm font-semibold text-success-green">
              Dividend: {formatPKRAmount(totalDividendValue)}
            </Text>
            <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
              Free Cash: {freeCashText}
            </Text>
            <View className="mt-2 items-end">
              <Text className="text-[9px] font-semibold text-text-light dark:text-text-dark">
                Updated {formatUpdatedAt(marketAsOf)}
              </Text>
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
