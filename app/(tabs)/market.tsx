import {
  getCachedMarketSnapshot,
  getLatestMarketSnapshot,
  getMarketIndexDefinitions,
  MarketIndexSnapshot,
} from "@/src/features/market/market-data";
import {
  DpsMarketStatusSnapshot,
  getCachedDpsMarketStatus,
  getLatestDpsMarketStatus,
} from "@/src/features/market/dps-market-status";
import { APP_COLORS } from "@/src/theme/colors";
import { useRouter } from "expo-router";
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
import { useColorScheme } from "nativewind";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const MARKET_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function formatPoints(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedPoints(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  if (value > 0) {
    return `+${formatPoints(value)}`;
  }

  if (value < 0) {
    return `-${formatPoints(Math.abs(value))}`;
  }

  return "0.00";
}

function formatSignedPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00%";
  }

  if (value > 0) {
    return `+${Math.abs(value).toFixed(2)}%`;
  }

  if (value < 0) {
    return `-${Math.abs(value).toFixed(2)}%`;
  }

  return "0.00%";
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

function getChangeClassName(value: number): string {
  if (value > 0) {
    return "text-success-green";
  }

  if (value < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 py-1 pr-2">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
        {label}
      </Text>
      <Text className="mt-0.5 text-sm font-bold text-app-text dark:text-app-textDark">
        {value}
      </Text>
    </View>
  );
}

export default function MarketTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const openPulseAnim = React.useRef(new Animated.Value(0)).current;

  const [indices, setIndices] = React.useState<MarketIndexSnapshot[]>([]);
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
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);

  const refreshMarket = React.useCallback(async () => {
    const [cachedSnapshot, cachedDpsStatus] = await Promise.all([
      getCachedMarketSnapshot(),
      getCachedDpsMarketStatus(),
    ]);
    setIndices(cachedSnapshot);
    setDpsMarketStatus(cachedDpsStatus);

    const [latestSnapshot, latestDpsStatus] = await Promise.all([
      getLatestMarketSnapshot(),
      getLatestDpsMarketStatus(),
    ]);
    setIndices(latestSnapshot);
    setDpsMarketStatus(latestDpsStatus);
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        await refreshMarket();
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();
    const intervalId = setInterval(() => {
      void refreshMarket();
    }, MARKET_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [refreshMarket]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshMarket();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshMarket]);

  const marketList = React.useMemo(() => {
    if (indices.length > 0) {
      return indices;
    }

    return getMarketIndexDefinitions().map((definition) => ({
      code: definition.code,
      displayCode: definition.displayCode,
      name: definition.name,
      highPrice: 0,
      lowPrice: 0,
      volume: 0,
      value: 0,
      latestPrice: 0,
      change: 0,
      changePct: 0,
      asOf: null,
      source: "fallback" as const,
    }));
  }, [indices]);

  const headline = React.useMemo(
    () => marketList.find((indexItem) => indexItem.code === "KSE100") ?? null,
    [marketList]
  );
  const hasLiveData = React.useMemo(
    () =>
      marketList.some(
        (indexItem) => indexItem.asOf !== null && Number.isFinite(indexItem.latestPrice)
      ),
    [marketList]
  );
  const handleOpenIndexDetail = React.useCallback(
    (code: string) => {
      router.push({
        pathname: "/market-index",
        params: {
          code: code.trim().toUpperCase(),
        },
      });
    },
    [router]
  );
  const isMarketOpen = dpsMarketStatus.uiStatus === "OPEN";

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
        ])
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

  const pulseScale = openPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.4],
  });
  const pulseOpacity = openPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.34, 0],
  });
  const statusDotColor = isMarketOpen
    ? APP_COLORS.success.green
    : APP_COLORS.brand.red;

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
          paddingBottom: insets.bottom + 56,
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
        <View className="gap-3">
          <View className="rounded-2xl bg-brand-white px-4 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
            <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
              Market
            </Text>
            <View className="mt-3 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="mr-2 h-3.5 w-3.5 items-center justify-center">
                  {isMarketOpen ? (
                    <Animated.View
                      style={{
                        position: "absolute",
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        backgroundColor: APP_COLORS.success.green,
                        transform: [{ scale: pulseScale }],
                        opacity: pulseOpacity,
                      }}
                    />
                  ) : null}
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: statusDotColor,
                    }}
                  />
                </View>
                  <Text
                  className={[
                    "text-sm font-bold uppercase",
                    isMarketOpen
                      ? "text-success-green"
                      : "text-brand-red",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {dpsMarketStatus.stateText}
                </Text>
              </View>

              <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                Last update: {formatUpdatedAt(headline?.asOf ?? null)}
              </Text>
            </View>

            <View className="mt-2 flex-row items-baseline">
              <Text className="mr-2 text-base font-bold text-app-text dark:text-app-textDark">
                KSE100
              </Text>
              <Text className="text-base font-bold text-app-text dark:text-app-textDark">
                {formatPoints(headline?.latestPrice ?? 0)}
              </Text>
              <Text
                className={[
                  "ml-2 text-base font-bold",
                  getChangeClassName(headline?.change ?? 0),
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {formatSignedPoints(headline?.change ?? 0)} (
                {formatSignedPercentage(headline?.changePct ?? 0)})
              </Text>
            </View>
          </View>

          {isBootstrapping && !hasLiveData ? (
            <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                Loading market indices...
              </Text>
            </View>
          ) : null}

          {!isBootstrapping && !hasLiveData ? (
            <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                No market data available right now. Pull to refresh.
              </Text>
            </View>
          ) : null}

          <View className="gap-3">
            {marketList.map((indexItem) => (
              <TouchableOpacity
                key={indexItem.code}
                activeOpacity={0.92}
                onPress={() => handleOpenIndexDetail(indexItem.code)}
                className="rounded-2xl bg-brand-white px-3 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1 pr-2">
                    <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
                      {indexItem.displayCode}
                    </Text>
                    <Text
                      className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark"
                      numberOfLines={2}
                    >
                      {indexItem.name}
                    </Text>
                  </View>

                  <View className="items-end">
                    <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
                      {formatPoints(indexItem.latestPrice)}
                    </Text>
                    <Text
                      className={[
                        "mt-1 text-sm font-extrabold",
                        getChangeClassName(indexItem.change),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {formatSignedPoints(indexItem.change)} (
                      {formatSignedPercentage(indexItem.changePct)})
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row flex-wrap">
                  <MetricCell label="High" value={formatPoints(indexItem.highPrice)} />
                  <MetricCell label="Low" value={formatPoints(indexItem.lowPrice)} />
                  <MetricCell label="Volume" value={formatCompactMetric(indexItem.volume)} />
                  <MetricCell label="Value" value={formatCompactMetric(indexItem.value)} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
