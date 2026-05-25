
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import {
  AppSkeletonBlock,
} from "@/components/ui/app-skeleton";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import React from "react";
import {
  AppState,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import ShariahChip from "@/components/ui/shariah-chip";
import { useGuardedRouter } from "@/src/lib/navigation";
import {
  getCachedMarketIndexConstituents,
  getLatestMarketIndexConstituents,
} from "@/src/features/market/market-data";
import { getCachedDpsMarketStatus } from "@/src/features/market/dps-market-status";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import { APP_COLORS } from "@/src/theme/colors";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  getCachedSymbolQuote,
  getCachedSymbols,
  getLatestSymbolQuote,
  getLatestSymbols,
  getStrictLiveSymbolQuote,
  getStrictLiveSymbols,
  getSymbolQuoteFallback,
  PsxSymbol,
  SymbolQuote,
} from "@/src/features/trade/trade-data";

const STOCK_ROW_HEIGHT = 184;
const STOCK_ROW_SPACING = 8;
const STOCK_PAGE_SIZE = 20;
const MAX_CONCURRENT_QUOTE_REQUESTS = 6;
const SYMBOL_QUOTE_TIMEOUT_MS = 15_000;
const STOCKS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
type StockShariahFilter = "all" | "shariah" | "nonShariah";
type StockSortMode = "az" | "weightHigh" | "weightLow" | "priceLow" | "priceHigh";

const STOCK_SHARIAH_FILTER_OPTIONS: {
  value: StockShariahFilter;
  label: string;
}[] = [
  { value: "all", label: "All Stocks" },
  { value: "shariah", label: "Shariah" },
  { value: "nonShariah", label: "Non-Shariah" },
];

const STOCK_SORT_OPTIONS: {
  value: StockSortMode;
  label: string;
}[] = [
  { value: "az", label: "A-Z" },
  { value: "weightHigh", label: "Weight High" },
  { value: "weightLow", label: "Weight Low" },
  { value: "priceLow", label: "Price: Low to High" },
  { value: "priceHigh", label: "Price: High to Low" },
];

function sortSymbolsAlphabetically(symbols: PsxSymbol[]): PsxSymbol[] {
  return [...symbols].sort((firstSymbol, secondSymbol) =>
    firstSymbol.symbol.localeCompare(secondSymbol.symbol)
  );
}

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
    return "--";
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

function formatCompactVolume(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return Math.round(value).toLocaleString("en-PK");
}

function formatWeightPercentage(value: number | undefined): string {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${(value ?? 0).toFixed(2)}%`;
}

function getRelativePercentage(currentValue: number, referenceValue: number): number {
  if (!Number.isFinite(currentValue) || !Number.isFinite(referenceValue) || referenceValue === 0) {
    return 0;
  }

  return ((currentValue - referenceValue) / referenceValue) * 100;
}

const StockRow = React.memo(function StockRow({
  symbolItem,
  quote,
  weightPct,
  isShariahCompliant,
  onPress,
}: {
  symbolItem: PsxSymbol;
  quote?: SymbolQuote;
  weightPct?: number;
  isShariahCompliant: boolean;
  onPress: (symbol: string) => void;
}) {
  const isQuoteReady = Boolean(quote);
  const highPct = quote
    ? getRelativePercentage(quote.highPrice, quote.previousClose)
    : 0;
  const lowPct = quote
    ? getRelativePercentage(quote.lowPrice, quote.previousClose)
    : 0;
  const totalVolume = quote?.totalVolume ?? quote?.lastVolume ?? 0;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(symbolItem.symbol)}
      className="h-[184px] rounded-2xl bg-brand-white px-5 pt-4 pb-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-lg font-extrabold text-app-text dark:text-app-textDark">
              {symbolItem.symbol}
            </Text>
            {isShariahCompliant ? <ShariahChip compact /> : null}
          </View>
          <Text
            className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark"
            numberOfLines={1}
          >
            {symbolItem.name}
          </Text>
          <Text
            className="mt-1 text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark"
            numberOfLines={1}
          >
            {symbolItem.sectorName}
          </Text>
          <Text className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
            Weight {formatWeightPercentage(weightPct)}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-xl font-extrabold text-app-text dark:text-app-textDark">
            {isQuoteReady ? formatPrice(quote?.lastPrice ?? 0) : "--"}
          </Text>
          <Text
            className={["mt-1 text-xs font-extrabold", getChangeTextClassName(quote?.change ?? 0)]
              .filter(Boolean)
              .join(" ")}
          >
            {isQuoteReady
              ? `${formatSignedPriceChange(quote?.change ?? 0)} (${formatSignedPercentage(quote?.changePct ?? 0)})`
              : ""}
          </Text>
          {!isQuoteReady ? (
            <View className="mt-1">
              <AppSkeletonBlock width={88} height={10} borderRadius={6} />
            </View>
          ) : null}
        </View>
      </View>

      <View className="mt-3 flex-row">
        <View className="w-1/2 pr-2">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
            High
          </Text>
          <Text className="mt-0.5 text-sm font-bold text-app-text dark:text-app-textDark">
            {isQuoteReady ? formatPrice(quote?.highPrice ?? 0) : "--"}
          </Text>
          <Text
            className={["text-[11px] font-bold", getChangeTextClassName(highPct)]
              .filter(Boolean)
              .join(" ")}
          >
            {isQuoteReady ? formatSignedPercentage(highPct) : "--"}
          </Text>
        </View>

        <View className="w-1/2 pl-2">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
            Low
          </Text>
          <Text className="mt-0.5 text-sm font-bold text-app-text dark:text-app-textDark">
            {isQuoteReady ? formatPrice(quote?.lowPrice ?? 0) : "--"}
          </Text>
          <Text
            className={["text-[11px] font-bold", getChangeTextClassName(lowPct)]
              .filter(Boolean)
              .join(" ")}
          >
            {isQuoteReady ? formatSignedPercentage(lowPct) : "--"}
          </Text>
        </View>
      </View>

      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
          Total Volume
        </Text>
        <Text className="text-xs font-bold text-app-text dark:text-app-textDark">
          {isQuoteReady ? formatCompactVolume(totalVolume) : "--"}
        </Text>
      </View>
    </TouchableOpacity>
  );
},
(previousProps, nextProps) =>
  previousProps.symbolItem.symbol === nextProps.symbolItem.symbol &&
  previousProps.symbolItem.name === nextProps.symbolItem.name &&
  previousProps.symbolItem.sectorName === nextProps.symbolItem.sectorName &&
  previousProps.weightPct === nextProps.weightPct &&
  previousProps.quote?.symbol === nextProps.quote?.symbol &&
  previousProps.quote?.lastPrice === nextProps.quote?.lastPrice &&
  previousProps.quote?.change === nextProps.quote?.change &&
  previousProps.quote?.changePct === nextProps.quote?.changePct &&
  previousProps.quote?.highPrice === nextProps.quote?.highPrice &&
  previousProps.quote?.lowPrice === nextProps.quote?.lowPrice &&
  previousProps.quote?.previousClose === nextProps.quote?.previousClose &&
  previousProps.quote?.lastVolume === nextProps.quote?.lastVolume &&
  previousProps.quote?.totalVolume === nextProps.quote?.totalVolume &&
  previousProps.quote?.asOf === nextProps.quote?.asOf &&
  previousProps.isShariahCompliant === nextProps.isShariahCompliant &&
  previousProps.onPress === nextProps.onPress
);

function StockRowSkeleton() {
  return (
    <View className="h-[184px] rounded-2xl bg-brand-white px-5 pt-4 pb-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <AppSkeletonBlock width={70} height={22} borderRadius={8} />
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
            width="56%"
            height={10}
            borderRadius={6}
          />
          <AppSkeletonBlock
            className="mt-1.5"
            width={72}
            height={9}
            borderRadius={6}
          />
        </View>

        <View className="items-end">
          <AppSkeletonBlock width={96} height={22} borderRadius={8} />
          <AppSkeletonBlock
            className="mt-2"
            width={88}
            height={12}
            borderRadius={7}
          />
        </View>
      </View>

      <View className="mt-3 flex-row">
        <View className="w-1/2 pr-2">
          <AppSkeletonBlock width={38} height={10} borderRadius={6} />
          <AppSkeletonBlock
            className="mt-2"
            width={72}
            height={12}
            borderRadius={7}
          />
          <AppSkeletonBlock
            className="mt-2"
            width={58}
            height={10}
            borderRadius={6}
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
          <AppSkeletonBlock
            className="mt-2"
            width={56}
            height={10}
            borderRadius={6}
          />
        </View>
      </View>

      <View className="mt-2 flex-row items-center justify-between">
        <AppSkeletonBlock width={78} height={10} borderRadius={6} />
        <AppSkeletonBlock width={54} height={10} borderRadius={6} />
      </View>
    </View>
  );
}

function StockFilterRowOption({
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

export default function StocksTabScreen() {
  const router = useGuardedRouter();
  const searchParams = useLocalSearchParams<{
    originTab?: string | string[];
  }>();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const routeOriginTab = React.useMemo(() => {
    const rawOriginTab = Array.isArray(searchParams.originTab)
      ? searchParams.originTab[0]
      : searchParams.originTab;
    return typeof rawOriginTab === "string" ? rawOriginTab.trim().toLowerCase() : "";
  }, [searchParams.originTab]);
  const shouldShowBackToMore = routeOriginTab === "more";

  const [symbols, setSymbols] = React.useState<PsxSymbol[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [shariahFilter, setShariahFilter] =
    React.useState<StockShariahFilter>("all");
  const [sortMode, setSortMode] = React.useState<StockSortMode>("az");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [quotesBySymbol, setQuotesBySymbol] = React.useState<Record<string, SymbolQuote>>(
    {}
  );
  const [weightsBySymbol, setWeightsBySymbol] = React.useState<Record<string, number>>(
    {}
  );
  const [visibleStockCount, setVisibleStockCount] = React.useState(
    STOCK_PAGE_SIZE
  );
  const stocksSkeletonRowCount = React.useMemo(
    () =>
      Math.max(
        5,
        Math.ceil(
          Math.max(windowHeight - insets.bottom - 240, 400) /
            (STOCK_ROW_HEIGHT + STOCK_ROW_SPACING)
        )
      ),
    [insets.bottom, windowHeight]
  );

  const quoteQueueRef = React.useRef<{ symbol: string; forceRefresh: boolean }[]>(
    []
  );
  const queuedSymbolsRef = React.useRef(new Set<string>());
  const inFlightSymbolsRef = React.useRef(new Set<string>());
  const hydratedSymbolsRef = React.useRef(new Set<string>());
  const prefetchSymbolsRef = React.useRef<string[]>([]);
  const shouldFetchLiveQuotesRef = React.useRef(true);
  const isMountedRef = React.useRef(false);
  const filterSheetRef = React.useRef<BottomSheetModal>(null);
  const filterSheetSnapPoints = React.useMemo(() => ["56%"], []);

  React.useEffect(() => {
    isMountedRef.current = true;
    const queuedSymbolsSet = queuedSymbolsRef.current;
    const inFlightSymbolsSet = inFlightSymbolsRef.current;
    const hydratedSymbolsSet = hydratedSymbolsRef.current;

    return () => {
      isMountedRef.current = false;
      quoteQueueRef.current = [];
      queuedSymbolsSet.clear();
      inFlightSymbolsSet.clear();
      hydratedSymbolsSet.clear();
    };
  }, []);

  const loadSymbols = React.useCallback(
    async (showLoader = false, forceLive = false) => {
      if (showLoader && isMountedRef.current) {
        setIsBootstrapping(true);
      }

      try {
        const cachedSymbols = await getCachedSymbols();
        const hasUsableCachedSymbols = cachedSymbols.length > 0;
        if (hasUsableCachedSymbols && isMountedRef.current) {
          setSymbols(sortSymbolsAlphabetically(cachedSymbols));
          if (showLoader && isMountedRef.current) {
            setIsBootstrapping(false);
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

        shouldFetchLiveQuotesRef.current = isMarketOpen;
        const shouldFetchLiveSymbols =
          forceLive || !hasUsableCachedSymbols || isMarketOpen;

        if (shouldFetchLiveSymbols) {
          const latestSymbols = forceLive
            ? await getStrictLiveSymbols()
            : await getLatestSymbols();
          if (isMountedRef.current) {
            setSymbols(sortSymbolsAlphabetically(latestSymbols));
          }
        }
      } catch {
        // Keep previously loaded symbols when live fetch fails.
      } finally {
        if (showLoader && isMountedRef.current) {
          setIsBootstrapping(false);
        }
      }
    },
    []
  );

  const loadIndexWeights = React.useCallback(async (forceLive = false) => {
    const toWeightMap = (items: { symbol: string; idxWeightPct: number }[]) => {
      const nextMap: Record<string, number> = {};
      for (const item of items) {
        const normalizedSymbol = item.symbol.trim().toUpperCase();
        if (normalizedSymbol.length === 0 || !Number.isFinite(item.idxWeightPct)) {
          continue;
        }
        nextMap[normalizedSymbol] = item.idxWeightPct;
      }
      return nextMap;
    };

    const mergeWeightMaps = (
      primaryItems: { symbol: string; idxWeightPct: number }[],
      fallbackItems: { symbol: string; idxWeightPct: number }[]
    ) => {
      const merged = toWeightMap(fallbackItems);
      const primary = toWeightMap(primaryItems);
      return {
        ...merged,
        ...primary,
      };
    };

    try {
      const [cachedKse100Snapshot, cachedAllShareSnapshot] = await Promise.all([
        getCachedMarketIndexConstituents("KSE100"),
        getCachedMarketIndexConstituents("ALLSHR"),
      ]);
      const hasCachedKse100 = Boolean(
        cachedKse100Snapshot && cachedKse100Snapshot.items.length > 0
      );
      const hasCachedAllShare = Boolean(
        cachedAllShareSnapshot && cachedAllShareSnapshot.items.length > 0
      );
      if ((hasCachedKse100 || hasCachedAllShare) && isMountedRef.current) {
        setWeightsBySymbol(
          mergeWeightMaps(
            cachedKse100Snapshot?.items ?? [],
            cachedAllShareSnapshot?.items ?? []
          )
        );
      }

      const [latestKse100Snapshot, latestAllShareSnapshot] = await Promise.all([
        getLatestMarketIndexConstituents("KSE100", {
          forceLive,
        }),
        getLatestMarketIndexConstituents("ALLSHR", {
          forceLive,
        }),
      ]);
      const hasLatestKse100 = Boolean(
        latestKse100Snapshot && latestKse100Snapshot.items.length > 0
      );
      const hasLatestAllShare = Boolean(
        latestAllShareSnapshot && latestAllShareSnapshot.items.length > 0
      );
      if ((hasLatestKse100 || hasLatestAllShare) && isMountedRef.current) {
        setWeightsBySymbol(
          mergeWeightMaps(
            latestKse100Snapshot?.items ?? [],
            latestAllShareSnapshot?.items ?? []
          )
        );
      }
    } catch {
      // Keep previous map when refresh fails.
    }
  }, []);

  React.useEffect(() => {
    void Promise.all([loadSymbols(true), loadIndexWeights()]);
  }, [loadSymbols, loadIndexWeights]);

  const filteredSymbols = React.useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    let nextSymbols = symbols;

    if (normalizedQuery.length > 0) {
      nextSymbols = nextSymbols.filter((symbolItem) => {
        const symbolMatch = symbolItem.symbol.toLowerCase().includes(normalizedQuery);
        const nameMatch = symbolItem.name.toLowerCase().includes(normalizedQuery);
        const sectorMatch = symbolItem.sectorName
          .toLowerCase()
          .includes(normalizedQuery);
        return symbolMatch || nameMatch || sectorMatch;
      });
    }

    if (shariahFilter === "shariah") {
      nextSymbols = nextSymbols.filter((item) => isShariahCompliantSymbol(item.symbol));
    } else if (shariahFilter === "nonShariah") {
      nextSymbols = nextSymbols.filter((item) => !isShariahCompliantSymbol(item.symbol));
    }

    const sortedSymbols = [...nextSymbols];
    if (sortMode === "az") {
      sortedSymbols.sort((firstSymbol, secondSymbol) =>
        firstSymbol.symbol.localeCompare(secondSymbol.symbol)
      );
      return sortedSymbols;
    }

    if (sortMode === "priceLow" || sortMode === "priceHigh") {
      sortedSymbols.sort((firstSymbol, secondSymbol) => {
        const firstPrice = quotesBySymbol[firstSymbol.symbol]?.lastPrice;
        const secondPrice = quotesBySymbol[secondSymbol.symbol]?.lastPrice;
        const firstIsValid = Number.isFinite(firstPrice);
        const secondIsValid = Number.isFinite(secondPrice);

        if (!firstIsValid && !secondIsValid) {
          return firstSymbol.symbol.localeCompare(secondSymbol.symbol);
        }
        if (!firstIsValid) {
          return 1;
        }
        if (!secondIsValid) {
          return -1;
        }

        if (sortMode === "priceLow") {
          return firstPrice - secondPrice;
        }
        return secondPrice - firstPrice;
      });
      return sortedSymbols;
    }

    sortedSymbols.sort((firstSymbol, secondSymbol) => {
      const firstWeight = weightsBySymbol[firstSymbol.symbol];
      const secondWeight = weightsBySymbol[secondSymbol.symbol];

      const normalizedFirstWeight = Number.isFinite(firstWeight)
        ? firstWeight
        : sortMode === "weightLow"
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY;
      const normalizedSecondWeight = Number.isFinite(secondWeight)
        ? secondWeight
        : sortMode === "weightLow"
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY;

      if (normalizedFirstWeight === normalizedSecondWeight) {
        return firstSymbol.symbol.localeCompare(secondSymbol.symbol);
      }

      if (sortMode === "weightLow") {
        return normalizedFirstWeight - normalizedSecondWeight;
      }

      return normalizedSecondWeight - normalizedFirstWeight;
    });

    return sortedSymbols;
  }, [
    deferredSearchQuery,
    isShariahCompliantSymbol,
    quotesBySymbol,
    shariahFilter,
    sortMode,
    symbols,
    weightsBySymbol,
  ]);

  React.useEffect(() => {
    setVisibleStockCount(STOCK_PAGE_SIZE);
  }, [deferredSearchQuery, shariahFilter, sortMode, symbols.length]);

  const hasActiveFilters = shariahFilter !== "all" || sortMode !== "az";

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

  const upsertQuote = React.useCallback((symbol: string, quote: SymbolQuote) => {
    if (!isMountedRef.current) {
      return;
    }

    setQuotesBySymbol((currentMap) => {
      const currentQuote = currentMap[symbol];
      if (
        currentQuote &&
        currentQuote.lastPrice === quote.lastPrice &&
        currentQuote.previousClose === quote.previousClose &&
        currentQuote.highPrice === quote.highPrice &&
        currentQuote.lowPrice === quote.lowPrice &&
        currentQuote.change === quote.change &&
        currentQuote.changePct === quote.changePct &&
        currentQuote.lastVolume === quote.lastVolume &&
        currentQuote.totalVolume === quote.totalVolume &&
        currentQuote.asOf === quote.asOf &&
        currentQuote.source === quote.source
      ) {
        return currentMap;
      }

      return {
        ...currentMap,
        [symbol]: quote,
      };
    });
  }, []);

  const loadQuoteForSymbol = React.useCallback(
    async (symbol: string, forceRefresh: boolean) => {
      const normalizedSymbol = symbol.trim().toUpperCase();
      if (normalizedSymbol.length === 0) {
        return;
      }

      if (!forceRefresh) {
        const cachedQuote = await getCachedSymbolQuote(normalizedSymbol);
        const hasUsableCachedQuote = Boolean(
          cachedQuote &&
            (cachedQuote.asOf !== null ||
              cachedQuote.lastPrice > 0 ||
              cachedQuote.previousClose > 0)
        );
        if (cachedQuote) {
          upsertQuote(normalizedSymbol, cachedQuote);
        }

        const shouldFetchLiveQuote =
          forceRefresh || shouldFetchLiveQuotesRef.current || !hasUsableCachedQuote;
        if (!shouldFetchLiveQuote) {
          hydratedSymbolsRef.current.add(normalizedSymbol);
          return;
        }
      }

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<SymbolQuote>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve(getSymbolQuoteFallback(normalizedSymbol));
        }, SYMBOL_QUOTE_TIMEOUT_MS);
      });
      const latestQuote = await Promise.race([
        (forceRefresh
          ? getStrictLiveSymbolQuote(normalizedSymbol)
          : getLatestSymbolQuote(normalizedSymbol)
        ).catch(() => getSymbolQuoteFallback(normalizedSymbol)),
        timeoutPromise,
      ]);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      upsertQuote(normalizedSymbol, latestQuote);

      hydratedSymbolsRef.current.add(normalizedSymbol);
    },
    [upsertQuote]
  );

  const processQuoteQueue = React.useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    while (
      inFlightSymbolsRef.current.size < MAX_CONCURRENT_QUOTE_REQUESTS &&
      quoteQueueRef.current.length > 0
    ) {
      const nextItem = quoteQueueRef.current.shift();
      if (!nextItem) {
        return;
      }

      queuedSymbolsRef.current.delete(nextItem.symbol);

      if (
        !nextItem.forceRefresh &&
        (hydratedSymbolsRef.current.has(nextItem.symbol) ||
          inFlightSymbolsRef.current.has(nextItem.symbol))
      ) {
        continue;
      }

      if (inFlightSymbolsRef.current.has(nextItem.symbol)) {
        continue;
      }

      inFlightSymbolsRef.current.add(nextItem.symbol);
      void loadQuoteForSymbol(nextItem.symbol, nextItem.forceRefresh).finally(() => {
        inFlightSymbolsRef.current.delete(nextItem.symbol);
        if (isMountedRef.current) {
          processQuoteQueue();
        }
      });
    }
  }, [loadQuoteForSymbol]);

  const enqueueQuoteLoads = React.useCallback(
    (symbolsToLoad: string[], forceRefresh = false) => {
      for (const rawSymbol of symbolsToLoad) {
        const symbol = rawSymbol.trim().toUpperCase();
        if (symbol.length === 0) {
          continue;
        }

        if (
          !forceRefresh &&
          (hydratedSymbolsRef.current.has(symbol) ||
            inFlightSymbolsRef.current.has(symbol) ||
            queuedSymbolsRef.current.has(symbol))
        ) {
          continue;
        }

        if (forceRefresh && inFlightSymbolsRef.current.has(symbol)) {
          continue;
        }

        if (queuedSymbolsRef.current.has(symbol)) {
          continue;
        }

        quoteQueueRef.current.push({ symbol, forceRefresh });
        queuedSymbolsRef.current.add(symbol);
      }

      if (quoteQueueRef.current.length > 0) {
        processQuoteQueue();
      }
    },
    [processQuoteQueue]
  );

  const refreshStocksLive = React.useCallback(
    async (forceLive = false) => {
      await Promise.all([loadSymbols(false, forceLive), loadIndexWeights(forceLive)]);
      if (!isMountedRef.current) {
        return;
      }
      hydratedSymbolsRef.current.clear();
      quoteQueueRef.current = [];
      queuedSymbolsRef.current.clear();
      inFlightSymbolsRef.current.clear();
      enqueueQuoteLoads(
        prefetchSymbolsRef.current,
        forceLive || shouldFetchLiveQuotesRef.current
      );
    },
    [enqueueQuoteLoads, loadIndexWeights, loadSymbols]
  );

  useFocusEffect(
    React.useCallback(() => {
      void refreshStocksLive();
    }, [refreshStocksLive])
  );

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      void refreshStocksLive();
    }, STOCKS_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshStocksLive]);

  React.useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshStocksLive();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [refreshStocksLive]);

  const visibleSymbols = React.useMemo(
    () => filteredSymbols.slice(0, visibleStockCount),
    [filteredSymbols, visibleStockCount]
  );

  const quotePrefetchSymbols = React.useMemo(
    () => visibleSymbols.map((item) => item.symbol),
    [visibleSymbols]
  );

  React.useEffect(() => {
    prefetchSymbolsRef.current = quotePrefetchSymbols;
    enqueueQuoteLoads(quotePrefetchSymbols);
  }, [enqueueQuoteLoads, quotePrefetchSymbols]);

  const handleOpenStockDetail = React.useCallback(
    (symbol: string) => {
      router.push({
        pathname: "/stock-detail",
        params: {
          symbol: symbol.trim().toUpperCase(),
          origin: "stocks",
        },
      });
    },
    [router]
  );
  const handleBackToMore = React.useCallback(() => {
    router.replace("/(tabs)/more");
  }, [router]);

  const renderItem = React.useCallback(
    ({ item }: { item: PsxSymbol }) => (
      <StockRow
        symbolItem={item}
        quote={quotesBySymbol[item.symbol]}
        weightPct={weightsBySymbol[item.symbol]}
        isShariahCompliant={isShariahCompliantSymbol(item.symbol)}
        onPress={handleOpenStockDetail}
      />
    ),
    [
      handleOpenStockDetail,
      isShariahCompliantSymbol,
      quotesBySymbol,
      weightsBySymbol,
    ]
  );
  const keyExtractor = React.useCallback((item: PsxSymbol) => item.symbol, []);

  const handlePullToRefresh = React.useCallback(async () => {
    if (!isMountedRef.current) {
      return;
    }
    setIsRefreshing(true);
    try {
      await refreshStocksLive(true);
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [refreshStocksLive]);

  const hasMoreStocks = visibleStockCount < filteredSymbols.length;

  const handleLoadMoreStocks = React.useCallback(() => {
    if (!hasMoreStocks) {
      return;
    }

    setVisibleStockCount((currentCount) => {
      return Math.min(filteredSymbols.length, currentCount + STOCK_PAGE_SIZE);
    });
  }, [filteredSymbols.length, hasMoreStocks]);

  const listHeader = React.useMemo(
    () => (
      <View className="pb-4">
        {shouldShowBackToMore ? (
          <View className="mb-1 flex-row items-center">
            <AppBackIconButton onPress={handleBackToMore} />
          </View>
        ) : null}

        <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
          Stocks
        </Text>
        <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
          A-Z listing with high, low, total volume and live move
        </Text>

        <View className="mt-3 flex-row items-center gap-2">
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by symbol, company, or sector"
            placeholderTextColor={inputPlaceholderTextColor}
            autoCorrect={false}
            autoCapitalize="characters"
            className="flex-1 rounded-2xl border border-app-highlight bg-brand-white px-4 py-3 text-sm font-semibold text-app-text dark:border-app-highlightDark dark:bg-transparent dark:text-app-textDark"
          />
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={openFilterSheet}
            className="h-[48px] w-[48px] items-center justify-center rounded-2xl border border-app-highlight/25 bg-app-highlight/8 dark:border-app-highlightDark/25 dark:bg-brand-white/10"
          >
            <MaterialCommunityIcons
              name={hasActiveFilters ? "filter-check-outline" : "filter-variant"}
              size={22}
              color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
            />
          </TouchableOpacity>
        </View>
      </View>
    ),
    [
      handleBackToMore,
      hasActiveFilters,
      inputPlaceholderTextColor,
      isDarkMode,
      openFilterSheet,
      searchQuery,
      shouldShowBackToMore,
    ]
  );

  const emptyState = React.useMemo(
    () => (
      <View
        className="flex-1 px-1 pb-8 pt-4"
        style={
          isBootstrapping
            ? { minHeight: Math.max(windowHeight - insets.bottom - 220, 460) }
            : undefined
        }
      >
        {isBootstrapping ? (
          <View className="gap-2">
            {Array.from({ length: stocksSkeletonRowCount }).map((_, index) => (
              <StockRowSkeleton key={`stock-row-skeleton-${index}`} />
            ))}
          </View>
        ) : symbols.length === 0 ? (
          <View className="items-center justify-center px-4 pt-6">
            <Text className="text-base font-bold text-app-text dark:text-app-textDark">
              No stocks available
            </Text>
            <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
              Pull down to retry loading symbols.
            </Text>
          </View>
        ) : (
          <View className="items-center justify-center px-4 pt-6">
            <Text className="text-base font-bold text-app-text dark:text-app-textDark">
              No match found
            </Text>
            <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
              Try another symbol, company, or sector keyword.
            </Text>
          </View>
        )}
      </View>
    ),
    [insets.bottom, isBootstrapping, stocksSkeletonRowCount, symbols.length, windowHeight]
  );

  const listFooter = React.useMemo(() => {
    if (filteredSymbols.length === 0) {
      return null;
    }

    if (!hasMoreStocks) {
      return (
        <View className="items-center py-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-light dark:text-text-dark">
            End of list
          </Text>
        </View>
      );
    }

    return (
      <View className="items-center py-3">
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={handleLoadMoreStocks}
                    className="rounded-2xl border border-app-highlight/25 bg-app-highlight/8 px-5 py-3 dark:border-app-highlightDark/25 dark:bg-brand-white/10"
                  >
                  <Text className="text-sm font-bold text-app-highlight dark:text-app-highlightDark">
            {`Load More (${Math.min(STOCK_PAGE_SIZE, filteredSymbols.length - visibleStockCount)})`}
                  </Text>
                </TouchableOpacity>
              </View>
    );
  }, [
    filteredSymbols.length,
    handleLoadMoreStocks,
    hasMoreStocks,
    visibleStockCount,
  ]);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <FlatList
        data={visibleSymbols}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ListFooterComponent={listFooter}
        ItemSeparatorComponent={() => <View style={{ height: STOCK_ROW_SPACING }} />}
        contentContainerStyle={{
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          flexGrow: visibleSymbols.length === 0 ? 1 : 0,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={9}
        updateCellsBatchingPeriod={30}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: STOCK_ROW_HEIGHT + STOCK_ROW_SPACING,
          offset: (STOCK_ROW_HEIGHT + STOCK_ROW_SPACING) * index,
          index,
        })}
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
            Sort & Filter
          </Text>

          <View className="mt-4 rounded-2xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/12 dark:bg-brand-white/10">
            <Text className="text-[11px] font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
              Filter By Compliance (select one)
            </Text>
            <View className="mt-2 gap-2">
              {STOCK_SHARIAH_FILTER_OPTIONS.map((option) => (
                <StockFilterRowOption
                  key={option.value}
                  label={option.label}
                  selected={shariahFilter === option.value}
                  onPress={() => setShariahFilter(option.value)}
                />
              ))}
            </View>

            <Text className="mt-4 text-[11px] font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
              Sort By (select one)
            </Text>
            <View className="mt-2 gap-2">
              {STOCK_SORT_OPTIONS.map((option) => (
                <StockFilterRowOption
                  key={option.value}
                  label={option.label}
                  selected={sortMode === option.value}
                  onPress={() => setSortMode(option.value)}
                />
              ))}
            </View>

            <Text className="mt-3 text-[10px] font-semibold text-app-text dark:text-app-textDark">
              Weight source: KSE100 (primary), ALLSHR (fallback).
            </Text>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
