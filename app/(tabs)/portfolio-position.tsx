import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import AppButton from "@/components/ui/app-button";
import {
  getPortfolioHoldingBySymbol,
  PortfolioHolding,
} from "@/src/features/portfolio/portfolio-data";
import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import { APP_COLORS } from "@/src/theme/colors";

const POSITION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function getValueToneClassName(value: number): string {
  if (value > 0) {
    return "text-success-green";
  }

  if (value < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function formatSignedPriceDelta(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  const signPrefix = value > 0 ? "+" : "";
  return `${signPrefix}${value.toFixed(2)}`;
}

function formatCompactVolume(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Math.round(value).toLocaleString("en-PK");
}

export default function PortfolioPositionScreen() {
  const router = useRouter();
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

  const [holding, setHolding] = React.useState<PortfolioHolding | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);

  const refreshPosition = React.useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setIsInitialLoading(true);
      }

      try {
        if (normalizedSymbol.length === 0) {
          setHolding(null);
          return;
        }

        const nextHolding = await getPortfolioHoldingBySymbol(normalizedSymbol);
        setHolding(nextHolding);
      } finally {
        if (showLoader) {
          setIsInitialLoading(false);
        }
      }
    },
    [normalizedSymbol]
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshPosition();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshPosition]);

  const handleTradeAction = React.useCallback(
    (side: "buy" | "sell") => {
      if (!holding) {
        return;
      }

      router.push({
        pathname: "/(tabs)/transactions",
        params: {
          symbol: holding.symbol,
          side,
          lockSymbol: "1",
        },
      });
    },
    [holding, router]
  );

  React.useEffect(() => {
    void refreshPosition(true);
    const intervalId = setInterval(() => {
      void refreshPosition();
    }, POSITION_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshPosition]);

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
              Position
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
                Loading position details...
              </Text>
            </View>
          ) : !holding ? (
            <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
              <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
                Position not found
              </Text>
              <Text className="mt-2 text-sm text-app-text dark:text-app-textDark">
                This symbol has no active holding right now.
              </Text>
            </View>
          ) : (
            <>
              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
                <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  {holding.symbol}
                </Text>
                <Text className="mt-1 text-xl font-extrabold text-app-text dark:text-app-textDark">
                  {holding.companyName}
                </Text>
                <Text className="mt-1 text-sm text-app-text dark:text-app-textDark">
                  {holding.sectorName}
                </Text>

                <View className="mt-4 flex-row flex-wrap gap-4">
                  <View className="min-w-[44%]">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Avg Buy
                    </Text>
                    <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                      {holding.averageBuyPrice.toFixed(2)}
                    </Text>
                  </View>
                  <View className="min-w-[44%]">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Current
                    </Text>
                    <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                      {holding.currentPrice.toFixed(2)}
                    </Text>
                  </View>
                  <View className="min-w-[44%]">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Units
                    </Text>
                    <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                      {holding.units}
                    </Text>
                  </View>
                  <View className="min-w-[44%]">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                      Volume
                    </Text>
                    <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                      {formatCompactVolume(holding.lastVolume)}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
                <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  Position Summary
                </Text>

                <View className="mt-3 gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      Invested
                    </Text>
                    <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                      {formatPKRAmount(holding.invested)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      Market Value
                    </Text>
                    <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                      {formatPKRAmount(holding.marketValue)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      Price Change
                    </Text>
                    <Text
                      className={[
                        "text-sm font-bold",
                        getValueToneClassName(holding.priceDiff),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {`${formatSignedPriceDelta(holding.priceDiff)} (${formatSignedPercentage(
                        holding.priceDiffPct
                      )})`}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      Profit / Loss
                    </Text>
                    <Text
                      className={[
                        "text-sm font-bold",
                        getValueToneClassName(holding.pnl),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {`${formatPKRAmount(holding.pnl)} (${formatSignedPercentage(holding.pnlPct)})`}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <AppButton
                    label="Buy More"
                    variant="primary"
                    size="sm"
                    onPress={() => handleTradeAction("buy")}
                  />
                </View>
                <View className="flex-1">
                  <AppButton
                    label="Sell"
                    variant="danger"
                    size="sm"
                    onPress={() => handleTradeAction("sell")}
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
