import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { APP_COLORS } from "@/src/theme/colors";
import {
  getCachedSymbols,
  getLatestSymbols,
  PsxSymbol,
} from "@/src/features/trade/trade-data";

const STOCK_ROW_HEIGHT = 88;
const STOCK_ROW_SPACING = 8;

function sortSymbolsAlphabetically(symbols: PsxSymbol[]): PsxSymbol[] {
  return [...symbols].sort((firstSymbol, secondSymbol) =>
    firstSymbol.symbol.localeCompare(secondSymbol.symbol)
  );
}

const StockRow = React.memo(function StockRow({
  symbolItem,
  onPress,
}: {
  symbolItem: PsxSymbol;
  onPress: (symbol: string) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(symbolItem.symbol)}
      className="h-[88px] rounded-2xl bg-brand-white px-4 py-3 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg font-extrabold text-app-text dark:text-app-textDark">
            {symbolItem.symbol}
          </Text>
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
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function StocksTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;

  const [symbols, setSymbols] = React.useState<PsxSymbol[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadSymbols = React.useCallback(async (showLoader = false) => {
    if (showLoader) {
      setIsBootstrapping(true);
    }

    try {
      const cachedSymbols = await getCachedSymbols();
      if (cachedSymbols.length > 0) {
        setSymbols(sortSymbolsAlphabetically(cachedSymbols));
      }

      const latestSymbols = await getLatestSymbols();
      if (latestSymbols.length > 0) {
        setSymbols(sortSymbolsAlphabetically(latestSymbols));
      }
    } finally {
      if (showLoader) {
        setIsBootstrapping(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void loadSymbols(true);
  }, [loadSymbols]);

  const filteredSymbols = React.useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return symbols;
    }

    return symbols.filter((symbolItem) => {
      const symbolMatch = symbolItem.symbol.toLowerCase().includes(normalizedQuery);
      const nameMatch = symbolItem.name.toLowerCase().includes(normalizedQuery);
      const sectorMatch = symbolItem.sectorName
        .toLowerCase()
        .includes(normalizedQuery);
      return symbolMatch || nameMatch || sectorMatch;
    });
  }, [deferredSearchQuery, symbols]);

  const handleOpenStockDetail = React.useCallback(
    (symbol: string) => {
      router.push({
        pathname: "/stock-detail",
        params: {
          symbol: symbol.trim().toUpperCase(),
        },
      });
    },
    [router]
  );

  const renderItem = React.useCallback(
    ({ item }: { item: PsxSymbol }) => (
      <StockRow symbolItem={item} onPress={handleOpenStockDetail} />
    ),
    [handleOpenStockDetail]
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadSymbols();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadSymbols]);

  const listHeader = (
    <View className="pb-4">
      <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
        Stocks
      </Text>
      <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
        A-Z listing of PSX symbols
      </Text>

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search by symbol, company, or sector"
        placeholderTextColor={inputPlaceholderTextColor}
        autoCorrect={false}
        autoCapitalize="characters"
        className="mt-3 rounded-2xl border border-app-highlight bg-brand-white px-4 py-3 text-sm font-semibold text-app-text dark:border-app-highlightDark dark:bg-transparent dark:text-app-textDark"
      />
    </View>
  );

  const emptyState = (
    <View className="flex-1 items-center justify-center px-5 pb-8 pt-6">
      {isBootstrapping ? (
        <>
          <ActivityIndicator
            size="small"
            color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
          />
          <Text className="mt-3 text-sm font-semibold text-app-text dark:text-app-textDark">
            Loading stocks...
          </Text>
        </>
      ) : symbols.length === 0 ? (
        <>
          <Text className="text-base font-bold text-app-text dark:text-app-textDark">
            No stocks available
          </Text>
          <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
            Pull down to retry loading symbols.
          </Text>
        </>
      ) : (
        <>
          <Text className="text-base font-bold text-app-text dark:text-app-textDark">
            No match found
          </Text>
          <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
            Try another symbol, company, or sector keyword.
          </Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <FlatList
        data={filteredSymbols}
        keyExtractor={(item) => item.symbol}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ItemSeparatorComponent={() => <View style={{ height: STOCK_ROW_SPACING }} />}
        contentContainerStyle={{
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          flexGrow: filteredSymbols.length === 0 ? 1 : 0,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={24}
        maxToRenderPerBatch={24}
        windowSize={15}
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
    </SafeAreaView>
  );
}

