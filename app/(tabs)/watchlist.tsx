import AppButton from "@/components/ui/app-button";
import {
  AppSkeletonBlock,
} from "@/components/ui/app-skeleton";
import { useGuardedRouter } from "@/src/lib/navigation";
import AppFeedbackModal, {
  AppFeedbackModalTone,
} from "@/components/ui/app-feedback-modal";
import ShariahChip from "@/components/ui/shariah-chip";
import { getCachedDpsMarketStatus } from "@/src/features/market/dps-market-status";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  getCachedSymbolQuote,
  getCachedSymbols,
  getLatestSymbolQuote,
  getLatestSymbols,
  getSymbolQuoteFallback,
  PsxSymbol,
  SymbolQuote,
} from "@/src/features/trade/trade-data";
import {
  addSymbolToWatchlist,
  getSavedWatchlistItems,
  removeSymbolFromWatchlist,
  WatchlistItem,
} from "@/src/features/watchlist/watchlist-store";
import { APP_COLORS } from "@/src/theme/colors";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import React from "react";
import {
  AppState,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useColorScheme } from "nativewind";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const WATCHLIST_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type WatchlistRow = {
  symbol: string;
  name: string;
  sectorName: string;
  quote: SymbolQuote;
};

type WatchlistNotice = {
  title: string;
  message: string;
  tone: AppFeedbackModalTone;
};

function getChangeTextClassName(change: number): string {
  if (change > 0) {
    return "text-success-green";
  }

  if (change < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  return value.toFixed(2);
}

function formatSignedPriceChange(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  if (value > 0) {
    return `+${value.toFixed(2)}`;
  }

  if (value < 0) {
    return `-${Math.abs(value).toFixed(2)}`;
  }

  return "0.00";
}

function formatSignedPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.0%";
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

function formatCompactVolume(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return Math.round(value).toLocaleString("en-PK");
}

function formatQuoteAsOf(quote: SymbolQuote): string {
  if (!quote.asOf) {
    return quote.source === "fallback" ? "No market data yet" : "No timestamp";
  }

  const parsed = new Date(quote.asOf);
  if (Number.isNaN(parsed.getTime())) {
    return "No timestamp";
  }

  return `${parsed.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
  })} ${parsed.toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function buildSymbolsByCode(symbols: PsxSymbol[]): Map<string, PsxSymbol> {
  return new Map(symbols.map((symbol) => [symbol.symbol.trim().toUpperCase(), symbol]));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-full">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
        {label}
      </Text>
      <Text className="mt-0.5 text-sm font-bold text-app-text dark:text-app-textDark">
        {value}
      </Text>
    </View>
  );
}

function WatchlistCardSkeleton() {
  return (
    <View className="rounded-2xl bg-brand-white/95 px-3 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 pr-2">
          <View className="flex-row items-center gap-2">
            <AppSkeletonBlock width={62} height={22} borderRadius={8} />
            <AppSkeletonBlock width={28} height={16} borderRadius={8} />
          </View>
          <AppSkeletonBlock
            className="mt-2"
            width="78%"
            height={12}
            borderRadius={7}
          />
          <AppSkeletonBlock
            className="mt-2"
            width="52%"
            height={10}
            borderRadius={6}
          />
        </View>

        <View className="items-end">
          <AppSkeletonBlock width={34} height={24} borderRadius={8} />
          <AppSkeletonBlock
            className="mt-2"
            width={96}
            height={24}
            borderRadius={9}
          />
          <AppSkeletonBlock
            className="mt-2"
            width={86}
            height={12}
            borderRadius={7}
          />
        </View>
      </View>

      <View className="mt-3 flex-row flex-wrap gap-y-2">
        <View className="w-1/2 pr-2">
          <AppSkeletonBlock width={36} height={10} borderRadius={6} />
          <AppSkeletonBlock
            className="mt-2"
            width={68}
            height={12}
            borderRadius={7}
          />
        </View>
        <View className="w-1/2 pl-2">
          <AppSkeletonBlock width={30} height={10} borderRadius={6} />
          <AppSkeletonBlock
            className="mt-2"
            width={64}
            height={12}
            borderRadius={7}
          />
        </View>
        <View className="w-1/2 pr-2">
          <AppSkeletonBlock width={42} height={10} borderRadius={6} />
          <AppSkeletonBlock
            className="mt-2"
            width={72}
            height={12}
            borderRadius={7}
          />
        </View>
        <View className="w-1/2 pl-2">
          <AppSkeletonBlock width={34} height={10} borderRadius={6} />
          <AppSkeletonBlock
            className="mt-2"
            width={70}
            height={12}
            borderRadius={7}
          />
        </View>
      </View>

      <AppSkeletonBlock
        className="mt-3"
        width="36%"
        height={10}
        borderRadius={6}
      />
    </View>
  );
}

export default function WatchlistTabScreen() {
  const router = useGuardedRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;

  const addSheetRef = React.useRef<BottomSheetModal>(null);
  const addSheetSnapPoints = React.useMemo(() => ["72%", "92%"], []);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [watchlistSearchQuery, setWatchlistSearchQuery] = React.useState("");
  const [allSymbols, setAllSymbols] = React.useState<PsxSymbol[]>([]);
  const [watchlistItems, setWatchlistItems] = React.useState<WatchlistItem[]>([]);
  const [rows, setRows] = React.useState<WatchlistRow[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isHydrating, setIsHydrating] = React.useState(true);
  const [hasLoadedWatchlistItems, setHasLoadedWatchlistItems] = React.useState(false);
  const [isLoadingRows, setIsLoadingRows] = React.useState(false);
  const [notice, setNotice] = React.useState<WatchlistNotice | null>(null);
  const watchlistSkeletonCardCount = React.useMemo(
    () =>
      Math.max(
        3,
        Math.ceil(Math.max(windowHeight - insets.bottom - 260, 320) / 200)
      ),
    [insets.bottom, windowHeight]
  );

  const filteredSymbols = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery.length < 1) {
      return [];
    }

    return allSymbols
      .filter((symbol) => {
        const symbolMatch = symbol.symbol.toLowerCase().includes(normalizedQuery);
        const nameMatch = symbol.name.toLowerCase().includes(normalizedQuery);
        return symbolMatch || nameMatch;
      })
      .slice(0, 10);
  }, [allSymbols, searchQuery]);

  const filteredWatchlistRows = React.useMemo(() => {
    const normalizedQuery = watchlistSearchQuery.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return rows;
    }

    return rows.filter((row) => {
      const symbolMatch = row.symbol.toLowerCase().includes(normalizedQuery);
      const nameMatch = row.name.toLowerCase().includes(normalizedQuery);
      const sectorMatch = row.sectorName.toLowerCase().includes(normalizedQuery);
      return symbolMatch || nameMatch || sectorMatch;
    });
  }, [rows, watchlistSearchQuery]);

  const showNotice = React.useCallback(
    (title: string, message: string, tone: AppFeedbackModalTone) => {
      setNotice({ title, message, tone });
    },
    []
  );

  const closeNotice = React.useCallback(() => {
    setNotice(null);
  }, []);

  const openAddSheet = React.useCallback(() => {
    addSheetRef.current?.present();
  }, []);

  const closeAddSheet = React.useCallback(() => {
    addSheetRef.current?.dismiss();
  }, []);

  const addSheetBackdrop = React.useCallback(
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

  const loadWatchlistFromCache = React.useCallback(
    async (items: WatchlistItem[], symbolsByCode: Map<string, PsxSymbol>) => {
      if (items.length === 0) {
        setRows([]);
        return true;
      }

      const quotePairs = await Promise.all(
        items.map(async (item) => {
          const cachedQuote = await getCachedSymbolQuote(item.symbol);
          const quote = cachedQuote ?? getSymbolQuoteFallback(item.symbol);
          return [item, quote] as const;
        })
      );

      setRows(
        quotePairs.map(([item, quote]) => {
          const symbolMeta = symbolsByCode.get(item.symbol);
          return {
            symbol: item.symbol,
            name: symbolMeta?.name ?? item.symbol,
            sectorName: symbolMeta?.sectorName ?? "UNKNOWN",
            quote,
          };
        })
      );

      return quotePairs.some(([, quote]) => {
        return quote.asOf !== null || quote.lastPrice > 0 || quote.previousClose > 0;
      });
    },
    []
  );

  const loadWatchlistLatest = React.useCallback(
    async (items: WatchlistItem[], symbolsByCode: Map<string, PsxSymbol>) => {
      if (items.length === 0) {
        setRows([]);
        return;
      }

      const quotePairs = await Promise.all(
        items.map(async (item) => {
          const quote = await getLatestSymbolQuote(item.symbol);
          return [item, quote] as const;
        })
      );

      setRows(
        quotePairs.map(([item, quote]) => {
          const symbolMeta = symbolsByCode.get(item.symbol);
          return {
            symbol: item.symbol,
            name: symbolMeta?.name ?? item.symbol,
            sectorName: symbolMeta?.sectorName ?? "UNKNOWN",
            quote,
          };
        })
      );
    },
    []
  );

  const hydrateWatchlist = React.useCallback(async (
    preferCachedFirst = true,
    forceLive = false
  ) => {
    setIsLoadingRows(true);
    try {
      const [items, cachedSymbols] = await Promise.all([
        getSavedWatchlistItems(),
        getCachedSymbols(),
      ]);

      setWatchlistItems(items);
      setHasLoadedWatchlistItems(true);

      if (cachedSymbols.length > 0) {
        setAllSymbols(cachedSymbols);
      }

      let hasUsableCachedRows = false;
      if (preferCachedFirst) {
        hasUsableCachedRows = await loadWatchlistFromCache(
          items,
          buildSymbolsByCode(cachedSymbols)
        );
      }

      const hasUsableCachedSymbols = cachedSymbols.length > 0;
      let isMarketOpen = true;
      if (!forceLive) {
        try {
          const cachedMarketStatus = await getCachedDpsMarketStatus();
          isMarketOpen = cachedMarketStatus.uiStatus === "OPEN";
        } catch {
          isMarketOpen = true;
        }
      }

      const shouldFetchLiveSymbols =
        forceLive || isMarketOpen || !hasUsableCachedSymbols;
      const shouldFetchLiveQuotes =
        forceLive || isMarketOpen || !hasUsableCachedRows;

      let symbolsForRows = cachedSymbols;
      if (shouldFetchLiveSymbols) {
        const latestSymbols = await getLatestSymbols();
        if (latestSymbols.length > 0) {
          setAllSymbols(latestSymbols);
          symbolsForRows = latestSymbols;
        }
      }

      if (!shouldFetchLiveQuotes) {
        return;
      }

      const symbolsByCode = buildSymbolsByCode(symbolsForRows);
      await loadWatchlistLatest(items, symbolsByCode);
    } finally {
      setIsLoadingRows(false);
    }
  }, [loadWatchlistFromCache, loadWatchlistLatest]);

  const bootstrap = React.useCallback(async () => {
    setIsHydrating(true);
    try {
      await hydrateWatchlist(true);
    } finally {
      setIsHydrating(false);
    }
  }, [hydrateWatchlist]);

  React.useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      void hydrateWatchlist(true);
    }, WATCHLIST_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [hydrateWatchlist]);

  useFocusEffect(
    React.useCallback(() => {
      void hydrateWatchlist(true);
    }, [hydrateWatchlist])
  );

  React.useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void hydrateWatchlist(true);
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [hydrateWatchlist]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await hydrateWatchlist(false, true);
    } finally {
      setIsRefreshing(false);
    }
  }, [hydrateWatchlist]);

  const handleAddSymbol = React.useCallback(
    async (symbol: string) => {
      const normalizedSymbol = symbol.trim().toUpperCase();
      if (normalizedSymbol.length === 0) {
        return;
      }

      try {
        const added = await addSymbolToWatchlist(normalizedSymbol);
        if (!added) {
          showNotice(
            "Already Added",
            `${normalizedSymbol} is already in your watchlist.`,
            "info"
          );
          return;
        }

        setSearchQuery("");
        closeAddSheet();
        setWatchlistItems((currentItems) => {
          if (currentItems.some((item) => item.symbol === normalizedSymbol)) {
            return currentItems;
          }

          return [
            {
              symbol: normalizedSymbol,
              addedAt: new Date().toISOString(),
            },
            ...currentItems,
          ];
        });
        setRows((currentRows) => {
          if (currentRows.some((row) => row.symbol === normalizedSymbol)) {
            return currentRows;
          }

          const symbolMeta = allSymbols.find(
            (symbolItem) => symbolItem.symbol === normalizedSymbol
          );
          return [
            {
              symbol: normalizedSymbol,
              name: symbolMeta?.name ?? normalizedSymbol,
              sectorName: symbolMeta?.sectorName ?? "UNKNOWN",
              quote: getSymbolQuoteFallback(normalizedSymbol),
            },
            ...currentRows,
          ];
        });
        showNotice(
          "Added to Watchlist",
          `${normalizedSymbol} has been added successfully.`,
          "success"
        );
        void hydrateWatchlist(false);
      } catch {
        showNotice("Add Failed", "Could not add symbol to watchlist.", "error");
      }
    },
    [allSymbols, closeAddSheet, hydrateWatchlist, showNotice]
  );

  const handleRemoveSymbol = React.useCallback(
    async (symbol: string) => {
      try {
        await removeSymbolFromWatchlist(symbol);
        await hydrateWatchlist(false);
      } catch {
        showNotice("Remove Failed", "Could not remove symbol.", "error");
      }
    },
    [hydrateWatchlist, showNotice]
  );

  const shouldShowCenterLoader = !hasLoadedWatchlistItems;
  const shouldShowEmptyState = hasLoadedWatchlistItems && watchlistItems.length === 0;
  const shouldShowRowsLoader =
    watchlistItems.length > 0 && rows.length === 0 && (isHydrating || isLoadingRows);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: shouldShowCenterLoader ? 14 : shouldShowEmptyState ? 0 : 14,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + (watchlistItems.length > 0 ? 100 : 24),
          flexGrow: 1,
          justifyContent: shouldShowEmptyState ? "center" : "flex-start",
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
        {shouldShowCenterLoader ? (
          <View
            className="w-full gap-3"
            style={{ minHeight: Math.max(windowHeight - insets.bottom - 220, 460) }}
          >
            <View className="rounded-2xl bg-brand-white/95 px-4 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <AppSkeletonBlock width={126} height={22} borderRadius={9} />
              <AppSkeletonBlock
                className="mt-3"
                width="100%"
                height={38}
                borderRadius={12}
              />
            </View>
            {Array.from({ length: watchlistSkeletonCardCount }).map((_, index) => (
              <WatchlistCardSkeleton key={`watchlist-card-skeleton-${index}`} />
            ))}
          </View>
        ) : shouldShowEmptyState ? (
          <View className="items-center px-6">
            <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
              Watchlist
            </Text>
            <Text className="mt-3 text-center text-sm font-semibold text-app-text dark:text-app-textDark">
              No stocks in watchlist.
            </Text>
            <View className="mt-6 w-full max-w-xs">
              <AppButton
                label="Add Stocks"
                variant="primary"
                size="md"
                onPress={openAddSheet}
              />
            </View>
          </View>
        ) : (
          <View className="gap-3">
            <View className="rounded-2xl bg-brand-white/95 px-4 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <View className="flex-row items-center justify-between">
                <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
                  Watchlist
                </Text>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  {watchlistItems.length} stocks
                </Text>
              </View>

              <TextInput
                value={watchlistSearchQuery}
                onChangeText={setWatchlistSearchQuery}
                placeholder="Search in watchlist"
                placeholderTextColor={inputPlaceholderTextColor}
                className="mt-3 rounded-xl border border-app-highlight/20 bg-app-highlight/5 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/30 dark:bg-brand-white/5 dark:text-app-textDark"
              />
            </View>

            {shouldShowRowsLoader ? (
              <View className="gap-3">
                <WatchlistCardSkeleton />
                <WatchlistCardSkeleton />
                <WatchlistCardSkeleton />
              </View>
            ) : filteredWatchlistRows.length === 0 ? (
              <View className="rounded-2xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                  No stock matches your search.
                </Text>
              </View>
            ) : (
              filteredWatchlistRows.map((row) => (
                <TouchableOpacity
                  key={row.symbol}
                  activeOpacity={0.9}
                  onPress={() => {
                    router.push({
                      pathname: "/stock-detail",
                      params: {
                        symbol: row.symbol,
                        origin: "watchlist",
                      },
                    });
                  }}
                  className="rounded-2xl bg-brand-white/95 px-3 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
                >
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-xl font-extrabold text-app-text dark:text-app-textDark">
                          {row.symbol}
                        </Text>
                        {isShariahCompliantSymbol(row.symbol) ? <ShariahChip compact /> : null}
                      </View>
                      <Text
                        className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark"
                        numberOfLines={2}
                      >
                        {row.name}
                      </Text>
                      <Text
                        className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark"
                        numberOfLines={1}
                      >
                        {row.sectorName}
                      </Text>
                    </View>

                    <View className="items-end">
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={(event) => {
                          event.stopPropagation();
                          void handleRemoveSymbol(row.symbol);
                        }}
                        className="rounded-lg border border-brand-red/60 px-2 py-1"
                      >
                        <MaterialCommunityIcons
                          name="trash-can-outline"
                          size={14}
                          color={APP_COLORS.brand.red}
                        />
                      </TouchableOpacity>

                      <Text className="mt-2 text-2xl font-extrabold text-app-text dark:text-app-textDark">
                        {formatPrice(row.quote.lastPrice)}
                      </Text>
                      <Text
                        className={[
                          "mt-1 text-sm font-extrabold",
                          getChangeTextClassName(row.quote.change),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {formatSignedPriceChange(row.quote.change)} ({formatSignedPercentage(row.quote.changePct)})
                      </Text>
                    </View>
                  </View>

                  <View className="mt-3 flex-row flex-wrap gap-y-2">
                    <View className="w-1/2 pr-2">
                      <Metric label="High" value={formatPrice(row.quote.highPrice)} />
                    </View>
                    <View className="w-1/2 pl-2">
                      <Metric label="Low" value={formatPrice(row.quote.lowPrice)} />
                    </View>
                    <View className="w-1/2 pr-2">
                      <Metric label="Volume" value={formatCompactVolume(row.quote.lastVolume)} />
                    </View>
                    <View className="w-1/2 pl-2">
                      <Metric label="LDCP" value={formatPrice(row.quote.previousClose)} />
                    </View>
                  </View>

                  <Text className="mt-2 text-[11px] font-semibold text-app-text dark:text-app-textDark">
                    Updated: {formatQuoteAsOf(row.quote)}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {watchlistItems.length > 0 ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={openAddSheet}
          className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-app-highlight shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-app-highlightDark"
          style={{
            bottom: Math.max(12, insets.bottom + 8),
          }}
        >
          <MaterialCommunityIcons
            name="plus"
            size={30}
            color={isDarkMode ? APP_COLORS.brand.purple : APP_COLORS.brand.white}
          />
        </TouchableOpacity>
      ) : null}

      <BottomSheetModal
        ref={addSheetRef}
        snapPoints={addSheetSnapPoints}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={addSheetBackdrop}
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
            paddingBottom: insets.bottom + 16,
            paddingTop: 8,
          }}
        >
          <Text className="text-center text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
            Add Stocks
          </Text>

          <BottomSheetTextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search symbol or company"
            placeholderTextColor={inputPlaceholderTextColor}
            className="mt-3 rounded-xl border border-app-highlight/12 bg-app-highlight/5 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/12 dark:bg-brand-white/5 dark:text-app-textDark"
          />

          {searchQuery.trim().length === 0 ? (
            <Text className="mt-3 text-xs font-semibold text-app-text dark:text-app-textDark">
              Type at least 1 letter to search PSX symbols.
            </Text>
          ) : filteredSymbols.length === 0 ? (
            <Text className="mt-3 text-xs font-semibold text-app-text dark:text-app-textDark">
              No symbol found.
            </Text>
          ) : (
            <ScrollView className="mt-3 max-h-[360px]" showsVerticalScrollIndicator={false}>
              <View className="gap-2">
                {filteredSymbols.map((symbol) => {
                  const alreadyAdded = watchlistItems.some(
                    (item) => item.symbol === symbol.symbol
                  );

                  return (
                    <TouchableOpacity
                      key={symbol.symbol}
                      activeOpacity={0.88}
                      disabled={alreadyAdded}
                      onPress={() => {
                        void handleAddSymbol(symbol.symbol);
                      }}
                      className={[
                        "rounded-xl border px-3 py-2",
                        alreadyAdded
                          ? "border-app-highlight/10 bg-app-highlight/8 dark:border-app-highlightDark/12 dark:bg-brand-white/8"
                          : "border-app-highlight/10 bg-brand-white/90 dark:border-app-highlightDark/12 dark:bg-brand-white/5",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                              {symbol.symbol}
                            </Text>
                            {isShariahCompliantSymbol(symbol.symbol) ? (
                              <ShariahChip compact />
                            ) : null}
                          </View>
                          <Text
                            className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark"
                            numberOfLines={1}
                          >
                            {symbol.name}
                          </Text>
                        </View>
                        <Text className="text-[11px] font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                          {alreadyAdded ? "Added" : "Add"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={closeAddSheet}
            className="mt-3 rounded-xl bg-button-neutral px-4 py-3 dark:border dark:border-app-highlightDark/12 dark:bg-brand-white/5"
          >
            <Text className="text-center text-sm font-bold text-app-highlight dark:text-app-highlightDark">
              Close
            </Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>

      <AppFeedbackModal
        visible={notice !== null}
        title={notice?.title ?? ""}
        message={notice?.message ?? ""}
        tone={notice?.tone ?? "info"}
        actionLabel="Done"
        onClose={closeNotice}
      />
    </SafeAreaView>
  );
}
