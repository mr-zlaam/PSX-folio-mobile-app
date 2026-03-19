import React from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { InsightDisplayMode } from "@/src/features/home/home-data";
import { buildHomeViewModel } from "@/src/features/home/home-view-model";
import { ValueTone } from "@/src/features/home/types";
import {
  buildHomeSnapshotFromHoldings,
  DEFAULT_INSIGHT_DISPLAY_VALUES,
  InsightDisplayValues,
} from "@/src/features/home/home-portfolio-snapshot";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
  PortfolioHolding,
} from "@/src/features/portfolio/portfolio-data";
import { APP_COLORS } from "@/src/theme/colors";

const HOME_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const initialHomeData = React.useMemo(
    () => buildHomeSnapshotFromHoldings([]),
    []
  );
  const [insightMode, setInsightMode] = React.useState<InsightDisplayMode>("percentage");
  const [viewModel, setViewModel] = React.useState(() =>
    buildHomeViewModel(initialHomeData.snapshot)
  );
  const [insightDisplayValues, setInsightDisplayValues] =
    React.useState<InsightDisplayValues>(DEFAULT_INSIGHT_DISPLAY_VALUES);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleTradePress = React.useCallback(() => {
    router.push({
      pathname: "/(tabs)/transactions",
      params: {
        lockSymbol: "0",
      },
    });
  }, [router]);

  const applyHomeSnapshot = React.useCallback((holdings: PortfolioHolding[]) => {
    const nextHomeData = buildHomeSnapshotFromHoldings(holdings);
    setViewModel(buildHomeViewModel(nextHomeData.snapshot));
    setInsightDisplayValues(nextHomeData.insightDisplayValues);
  }, []);

  const refreshHomeSnapshot = React.useCallback(async () => {
    const cachedHoldings = await getPortfolioHoldingsWithCachedQuotes();
    applyHomeSnapshot(cachedHoldings);

    const latestHoldings = await getPortfolioHoldingsWithLatestQuotes();
    applyHomeSnapshot(latestHoldings);
  }, [applyHomeSnapshot]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshHomeSnapshot();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshHomeSnapshot]);

  React.useEffect(() => {
    void refreshHomeSnapshot();
    const intervalId = setInterval(() => {
      void refreshHomeSnapshot();
    }, HOME_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshHomeSnapshot]);

  const profitSummaryItem = React.useMemo(
    () => viewModel.summaryItems.find((item) => item.key === "profit"),
    [viewModel.summaryItems]
  );
  const returnSummaryItem = React.useMemo(
    () => viewModel.summaryItems.find((item) => item.key === "returnPct"),
    [viewModel.summaryItems]
  );
  const portfolioSummaryItems = React.useMemo(
    () => viewModel.summaryItems.filter((item) => item.key !== "profit"),
    [viewModel.summaryItems]
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
          paddingBottom: insets.bottom + 96,
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
        <View className="gap-7">
          <View className="rounded-3xl bg-brand-white/95 px-4 py-4 shadow-sm dark:bg-brand-white/10">
            <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
              Current Profit
            </Text>
            <Text
              className={[
                "mt-2 text-4xl font-extrabold",
                getToneClassName(profitSummaryItem?.tone ?? "neutral"),
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {profitSummaryItem?.value ?? "PKR 0"}
            </Text>
            <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
              Return: {returnSummaryItem?.value ?? "0.0%"}
            </Text>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
            <View className="flex-row items-center justify-between gap-3">
              <View className="self-start rounded-xl bg-app-highlight px-3 py-2 dark:bg-app-highlightDark">
                <Text className="text-xs font-bold uppercase tracking-wider text-brand-white dark:text-brand-purple">
                  Portfolio Summary
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <HeaderActionButton
                  label="Trade"
                  selected={true}
                  tone="danger"
                  onPress={handleTradePress}
                />
              </View>
            </View>

            <View className="mt-4 gap-3">
              {portfolioSummaryItems.map((item) => (
                <View key={item.key} className="rounded-2xl bg-brand-white/70 px-4 py-3 dark:bg-brand-white/5">
                  <View className="flex-row items-start justify-between">
                    <View className="mr-3 flex-1">
                      <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                        {item.label}
                      </Text>
                      <Text className="mt-1 text-xs text-app-text dark:text-app-textDark">
                        {item.hint}
                      </Text>
                    </View>

                    <Text
                      className={[
                        "text-base font-extrabold",
                        getToneClassName(item.tone),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {item.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
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
                    ? displayValues?.price ?? insight.valueText
                    : displayValues?.percentage ?? insight.valueText;

                return (
                  <View
                    key={insight.label}
                    className="flex-row items-center justify-between rounded-2xl bg-brand-white/70 px-4 py-3 dark:bg-brand-white/5"
                  >
                    <View className="mr-3 flex-1">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        {insight.label}
                      </Text>
                      <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                        {insight.symbol}
                      </Text>
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
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
