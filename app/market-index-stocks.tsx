import AppBackIconButton from "@/components/ui/app-back-icon-button";
import ShariahChip from "@/components/ui/shariah-chip";
import {
  getCachedMarketIndexConstituents,
  getLatestMarketIndexConstituents,
  getMarketIndexDefinitionByCode,
  MarketIndexConstituentSnapshot,
} from "@/src/features/market/market-data";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import { formatSignedPercentage } from "@/src/features/home/home-formatters";
import { APP_COLORS } from "@/src/theme/colors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const MARKET_CONSTITUENTS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
type ConstituentsFilter = "all" | "gainers" | "decliners" | "active";
const CONSTITUENTS_FILTER_OPTIONS: {
  value: ConstituentsFilter;
  label: string;
}[] = [
  { value: "active", label: "Most Active" },
  { value: "gainers", label: "Top Gainers" },
  { value: "decliners", label: "Top Decliners" },
  { value: "all", label: "All" },
];

function getValueToneClassName(value: number): string {
  if (value > 0) {
    return "text-success-green";
  }

  if (value < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function formatPoints(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function FilterChip({
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
        "rounded-xl border px-3 py-2",
        selected
          ? "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
          : "border-app-highlight/20 bg-app-highlight/5 dark:border-app-highlightDark/30 dark:bg-brand-white/5",
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

export default function MarketIndexStocksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const searchParams = useLocalSearchParams<{ code?: string | string[] }>();
  const normalizedCode = React.useMemo(() => {
    const rawCode = Array.isArray(searchParams.code)
      ? searchParams.code[0]
      : searchParams.code;
    return (rawCode ?? "").trim().toUpperCase();
  }, [searchParams.code]);
  const indexDefinition = React.useMemo(
    () => getMarketIndexDefinitionByCode(normalizedCode),
    [normalizedCode]
  );

  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeFilter, setActiveFilter] =
    React.useState<ConstituentsFilter>("active");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [constituents, setConstituents] =
    React.useState<MarketIndexConstituentSnapshot | null>(null);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const refreshConstituents = React.useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setIsInitialLoading(true);
      }

      try {
        if (normalizedCode.length === 0) {
          setConstituents(null);
          return;
        }

        const cachedSnapshot =
          await getCachedMarketIndexConstituents(normalizedCode);
        if (cachedSnapshot) {
          setConstituents(cachedSnapshot);
        }

        const latestSnapshot =
          await getLatestMarketIndexConstituents(normalizedCode);
        if (latestSnapshot) {
          setConstituents(latestSnapshot);
        }
      } finally {
        if (showLoader) {
          setIsInitialLoading(false);
        }
      }
    },
    [normalizedCode]
  );

  React.useEffect(() => {
    void refreshConstituents(true);
    const intervalId = setInterval(() => {
      void refreshConstituents();
    }, MARKET_CONSTITUENTS_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshConstituents]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshConstituents();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshConstituents]);

  const tabFilteredConstituents = React.useMemo(() => {
    const items = constituents?.items ?? [];
    if (activeFilter === "all") {
      return items;
    }

    if (activeFilter === "gainers") {
      return items
        .filter((item) => item.change > 0)
        .sort((first, second) => second.changePct - first.changePct);
    }

    if (activeFilter === "decliners") {
      return items
        .filter((item) => item.change < 0)
        .sort((first, second) => first.changePct - second.changePct);
    }

    return [...items].sort((first, second) => second.volume - first.volume);
  }, [activeFilter, constituents?.items]);

  const filteredConstituents = React.useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return tabFilteredConstituents;
    }

    return tabFilteredConstituents.filter((item) => {
      return (
        item.symbol.toLowerCase().includes(normalizedQuery) ||
        item.name.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [deferredSearchQuery, tabFilteredConstituents]);

  const handleOpenStock = React.useCallback(
    (symbol: string) => {
      const normalizedSymbol = symbol.trim().toUpperCase();
      if (normalizedSymbol.length === 0) {
        return;
      }

      router.push({
        pathname: "/stock-detail",
        params: {
          symbol: normalizedSymbol,
          origin: "market",
        },
      });
    },
    [router]
  );

  const titleText =
    indexDefinition?.displayCode ?? constituents?.indexCode ?? normalizedCode;
  const totalConstituentsCount = constituents?.items.length ?? 0;
  const shouldShowFilteredCountSuffix =
    activeFilter !== "all" || deferredSearchQuery.trim().length > 0;

  React.useEffect(() => {
    setSearchQuery("");
    setActiveFilter("active");
  }, [normalizedCode]);

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
            <Text className="max-w-[66%] text-center text-2xl font-extrabold text-app-text dark:text-app-textDark">
              {titleText} Stocks
            </Text>
            <View className="w-14" />
          </View>

          <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                Constituents
              </Text>
              <Text className="text-xs font-bold text-app-text dark:text-app-textDark">
                {(filteredConstituents.length ?? 0).toLocaleString("en-PK")}
                {shouldShowFilteredCountSuffix
                  ? ` / ${totalConstituentsCount.toLocaleString("en-PK")}`
                  : ""}
              </Text>
            </View>
            <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
              Source: {constituents?.endpointCode ?? "--"} | Updated:{" "}
              {formatUpdatedAt(constituents?.asOf ?? null)}
            </Text>

            {(constituents?.items.length ?? 0) > 0 ? (
              <>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {CONSTITUENTS_FILTER_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.value}
                      label={option.label}
                      selected={activeFilter === option.value}
                      onPress={() => setActiveFilter(option.value)}
                    />
                  ))}
                </View>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search symbol or company"
                  placeholderTextColor={searchPlaceholderTextColor}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  className="mt-3 rounded-xl border border-app-highlight/20 bg-app-highlight/5 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/30 dark:bg-brand-white/5 dark:text-app-textDark"
                />
              </>
            ) : null}
          </View>

          {isInitialLoading && (constituents?.items.length ?? 0) === 0 ? (
            <View className="items-center rounded-2xl bg-brand-white p-6 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <ActivityIndicator
                size="small"
                color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
              />
              <Text className="mt-3 text-sm font-semibold text-app-text dark:text-app-textDark">
                Loading stocks...
              </Text>
            </View>
          ) : null}

          {!isInitialLoading && (constituents?.items.length ?? 0) === 0 ? (
            <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                Constituents are not available for this index yet.
              </Text>
            </View>
          ) : null}

          {(constituents?.items.length ?? 0) > 0 &&
          filteredConstituents.length === 0 ? (
            <View className="rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                No stock matched your search.
              </Text>
            </View>
          ) : null}

          {filteredConstituents.length > 0 ? (
            <View className="gap-2">
              {filteredConstituents.map((item) => (
                <TouchableOpacity
                  key={item.symbol}
                  activeOpacity={0.9}
                  onPress={() => handleOpenStock(item.symbol)}
                  className="rounded-xl bg-brand-white p-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-base font-extrabold text-app-text dark:text-app-textDark">
                          {item.symbol}
                        </Text>
                        {isShariahCompliantSymbol(item.symbol) ? (
                          <ShariahChip compact />
                        ) : null}
                      </View>
                      <Text
                        className="mt-0.5 text-xs font-semibold text-app-text dark:text-app-textDark"
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                        Weight {item.idxWeightPct.toFixed(2)}%
                      </Text>
                    </View>

                    <View className="items-end">
                      <Text className="text-base font-extrabold text-app-text dark:text-app-textDark">
                        {formatPoints(item.current)}
                      </Text>
                      <Text
                        className={[
                          "mt-0.5 text-xs font-bold",
                          getValueToneClassName(item.change),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {`${item.change > 0 ? "+" : ""}${formatPoints(item.change)} (${formatSignedPercentage(item.changePct)})`}
                      </Text>
                      <Text className="mt-1 text-[10px] font-semibold text-app-text dark:text-app-textDark">
                        Vol {formatCompactMetric(item.volume)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
