import React from "react";
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import AppButton from "@/components/ui/app-button";
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
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import { APP_COLORS } from "@/src/theme/colors";
import { saveTradeOrder } from "@/src/features/trade/trade-orders";

const TRADE_QUOTE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SAVED_BROKER_LABEL = "Saved broker (from settings)";

type TradeSide = "buy" | "sell";
type BrokerMode = "saved" | "custom";
type TradeDateTimePickerMode = "date" | "time";

function formatDateTimeInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatEditablePrice(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
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

function getTradeSideActionText(side: TradeSide): "bought" | "sold" {
  return side === "buy" ? "bought" : "sold";
}

function ToggleChip({
  label,
  selected,
  selectedTone = "default",
  onPress,
}: {
  label: string;
  selected: boolean;
  selectedTone?: "default" | "danger";
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      className={[
        "rounded-xl border px-3 py-2",
        selected
          ? selectedTone === "danger"
            ? "border-brand-red bg-brand-red dark:border-brand-red dark:bg-brand-red"
            : "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
          : "border-app-highlight bg-button-neutral dark:border-app-highlightDark dark:bg-transparent",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-xs font-bold uppercase tracking-wide",
          selected
            ? selectedTone === "danger"
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

function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText?: (nextValue: string) => void;
  placeholder?: string;
  placeholderTextColor: string;
  keyboardType?: "default" | "numeric";
  editable?: boolean;
}) {
  return (
    <View className="flex-1">
      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        keyboardType={keyboardType}
        editable={editable}
        className="mt-1 rounded-xl border border-app-highlight bg-brand-white px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark dark:bg-transparent dark:text-app-textDark"
      />
    </View>
  );
}

export default function TransactionsTabScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    symbol?: string | string[];
    side?: string | string[];
    lockSymbol?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const [tradeSide, setTradeSide] = React.useState<TradeSide>("buy");
  const [brokerMode, setBrokerMode] = React.useState<BrokerMode>("saved");

  const [symbols, setSymbols] = React.useState<PsxSymbol[]>([]);
  const [symbolSearchQuery, setSymbolSearchQuery] = React.useState("");
  const [selectedSymbol, setSelectedSymbol] = React.useState("");
  const [symbolQuote, setSymbolQuote] = React.useState<SymbolQuote>(
    getSymbolQuoteFallback("")
  );

  const [priceInput, setPriceInput] = React.useState("");
  const [unitsInput, setUnitsInput] = React.useState("");
  const [tradeDateTime, setTradeDateTime] = React.useState(new Date());
  const [tradeDateTimePickerMode, setTradeDateTimePickerMode] =
    React.useState<TradeDateTimePickerMode>("date");
  const [isTradeDateTimePickerVisible, setIsTradeDateTimePickerVisible] =
    React.useState(false);
  const [isAwaitingTimeSelection, setIsAwaitingTimeSelection] =
    React.useState(false);
  const [customBrokerNameInput, setCustomBrokerNameInput] = React.useState("");
  const [customBrokerFeePctInput, setCustomBrokerFeePctInput] = React.useState("");
  const [hasEditedPrice, setHasEditedPrice] = React.useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const normalizedRouteSymbol = React.useMemo(() => {
    const rawSymbol = Array.isArray(searchParams.symbol)
      ? searchParams.symbol[0]
      : searchParams.symbol;
    return (rawSymbol ?? "").trim().toUpperCase();
  }, [searchParams.symbol]);

  const requestedRouteSide = React.useMemo(() => {
    const rawSide = Array.isArray(searchParams.side)
      ? searchParams.side[0]
      : searchParams.side;
    if (rawSide === "buy" || rawSide === "sell") {
      return rawSide;
    }
    return null;
  }, [searchParams.side]);

  const isSymbolLocked = React.useMemo(() => {
    const rawLockSymbol = Array.isArray(searchParams.lockSymbol)
      ? searchParams.lockSymbol[0]
      : searchParams.lockSymbol;
    return rawLockSymbol === "1" || rawLockSymbol === "true";
  }, [searchParams.lockSymbol]);

  const filteredSymbols = React.useMemo(() => {
    const normalizedQuery = symbolSearchQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return [];
    }

    return symbols
      .filter((symbolItem) => {
        const symbolMatch = symbolItem.symbol.toLowerCase().includes(normalizedQuery);
        const nameMatch = symbolItem.name.toLowerCase().includes(normalizedQuery);
        return symbolMatch || nameMatch;
      })
      .slice(0, 8);
  }, [symbolSearchQuery, symbols]);

  const refreshSymbols = React.useCallback(async () => {
    const cachedSymbols = await getCachedSymbols();
    if (cachedSymbols.length > 0) {
      setSymbols(cachedSymbols);
    }

    const latestSymbols = await getLatestSymbols();
    if (latestSymbols.length > 0) {
      setSymbols(latestSymbols);
    }
  }, []);

  const refreshQuoteForSymbol = React.useCallback(async (symbol: string) => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      setSymbolQuote(getSymbolQuoteFallback(""));
      return;
    }

    const cachedQuote = await getCachedSymbolQuote(normalizedSymbol);
    if (cachedQuote) {
      setSymbolQuote(cachedQuote);
    }

    const latestQuote = await getLatestSymbolQuote(normalizedSymbol);
    setSymbolQuote(latestQuote);
  }, []);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshSymbols();
      await refreshQuoteForSymbol(selectedSymbol);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshQuoteForSymbol, refreshSymbols, selectedSymbol]);

  React.useEffect(() => {
    if (normalizedRouteSymbol.length === 0) {
      return;
    }

    setSelectedSymbol(normalizedRouteSymbol);
    setSymbolSearchQuery(normalizedRouteSymbol);
  }, [normalizedRouteSymbol]);

  React.useEffect(() => {
    if (!requestedRouteSide) {
      return;
    }

    setTradeSide(requestedRouteSide);
  }, [requestedRouteSide]);

  React.useEffect(() => {
    void refreshSymbols();
  }, [refreshSymbols]);

  React.useEffect(() => {
    let isMounted = true;
    const normalizedSymbol = selectedSymbol.trim().toUpperCase();

    if (normalizedSymbol.length === 0) {
      setSymbolQuote(getSymbolQuoteFallback(""));
      setHasEditedPrice(false);
      setPriceInput("");
      return () => {
        isMounted = false;
      };
    }

    async function refreshQuote() {
      const cachedQuote = await getCachedSymbolQuote(normalizedSymbol);
      if (isMounted && cachedQuote) {
        setSymbolQuote(cachedQuote);
      }

      const latestQuote = await getLatestSymbolQuote(normalizedSymbol);
      if (isMounted) {
        setSymbolQuote(latestQuote);
      }
    }

    setSymbolQuote(getSymbolQuoteFallback(normalizedSymbol));
    setHasEditedPrice(false);

    void refreshQuote();
    const intervalId = setInterval(() => {
      void refreshQuote();
    }, TRADE_QUOTE_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [selectedSymbol]);

  React.useEffect(() => {
    if (!hasEditedPrice && symbolQuote.lastPrice > 0) {
      setPriceInput(formatEditablePrice(symbolQuote.lastPrice));
    }
  }, [hasEditedPrice, symbolQuote.lastPrice]);

  const handleSelectSymbol = React.useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setSymbolSearchQuery(symbol);
  }, []);

  const handleCreateOrder = React.useCallback(async () => {
    const normalizedSymbol = selectedSymbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      Alert.alert("Symbol Required", "Please select a symbol before creating order.");
      return;
    }

    const parsedPrice = Number(priceInput.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      Alert.alert("Invalid Price", "Enter a valid price greater than 0.");
      return;
    }

    const parsedUnits = Number(unitsInput.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedUnits) || parsedUnits <= 0) {
      Alert.alert("Invalid Units", "Enter units greater than 0.");
      return;
    }

    if (!Number.isInteger(parsedUnits)) {
      Alert.alert("Invalid Units", "Units must be a whole number.");
      return;
    }

    let brokerName: string | null = null;
    let brokerFeePct: number | null = null;

    if (brokerMode === "custom") {
      const normalizedBrokerName = customBrokerNameInput.trim();
      if (normalizedBrokerName.length === 0) {
        Alert.alert("Broker Required", "Enter your custom broker name.");
        return;
      }

      const parsedBrokerFeePct = Number(
        customBrokerFeePctInput.trim().replace(/,/g, "")
      );
      if (!Number.isFinite(parsedBrokerFeePct) || parsedBrokerFeePct < 0) {
        Alert.alert(
          "Invalid Broker Fee",
          "Enter broker fee percentage (0 or above)."
        );
        return;
      }

      brokerName = normalizedBrokerName;
      brokerFeePct = parsedBrokerFeePct;
    }

    setIsSubmittingOrder(true);
    try {
      const savedOrder = await saveTradeOrder({
        side: tradeSide,
        symbol: normalizedSymbol,
        price: parsedPrice,
        units: parsedUnits,
        tradedAt: tradeDateTime.toISOString(),
        brokerMode,
        brokerName,
        brokerFeePct,
      });

      Alert.alert(
        tradeSide === "buy" ? "Bought Successfully" : "Sold Successfully",
        `You have ${getTradeSideActionText(tradeSide)} ${
          savedOrder.units
        } shares of ${savedOrder.symbol} at ${formatPKRAmount(
          savedOrder.price
        )} per share.\nSaved locally on this device.`
      );

      setUnitsInput("");
      setCustomBrokerNameInput("");
      setCustomBrokerFeePctInput("");
      setTradeDateTime(new Date());
      setHasEditedPrice(false);
      if (symbolQuote.lastPrice > 0) {
        setPriceInput(formatEditablePrice(symbolQuote.lastPrice));
      }
    } catch {
      Alert.alert(
        "Trade Save Failed",
        "Could not save this trade locally. Please try again."
      );
    } finally {
      setIsSubmittingOrder(false);
    }
  }, [
    brokerMode,
    customBrokerFeePctInput,
    customBrokerNameInput,
    priceInput,
    selectedSymbol,
    symbolQuote.lastPrice,
    tradeDateTime,
    tradeSide,
    unitsInput,
  ]);

  const handleStartTradeDateTimeSelection = React.useCallback(() => {
    setTradeDateTimePickerMode("date");
    setIsAwaitingTimeSelection(false);
    setIsTradeDateTimePickerVisible(true);
  }, []);

  const handleTradeDateTimeChange = React.useCallback(
    (event: DateTimePickerEvent, selectedValue?: Date) => {
      if (event.type === "dismissed" || !selectedValue) {
        setIsTradeDateTimePickerVisible(false);
        setIsAwaitingTimeSelection(false);
        setTradeDateTimePickerMode("date");
        return;
      }

      if (tradeDateTimePickerMode === "date") {
        setTradeDateTime((currentValue) => {
          const nextValue = new Date(currentValue);
          nextValue.setFullYear(
            selectedValue.getFullYear(),
            selectedValue.getMonth(),
            selectedValue.getDate()
          );
          return nextValue;
        });

        setTradeDateTimePickerMode("time");
        setIsAwaitingTimeSelection(true);

        if (Platform.OS === "android") {
          setIsTradeDateTimePickerVisible(false);
          setTimeout(() => {
            setIsTradeDateTimePickerVisible(true);
          }, 0);
        }
        return;
      }

      setTradeDateTime((currentValue) => {
        const nextValue = new Date(currentValue);
        nextValue.setHours(selectedValue.getHours(), selectedValue.getMinutes());
        return nextValue;
      });

      setIsTradeDateTimePickerVisible(false);
      setIsAwaitingTimeSelection(false);
      setTradeDateTimePickerMode("date");
    },
    [tradeDateTimePickerMode]
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
              Trade
            </Text>

            <View className="w-14" />
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Symbol Search
            </Text>

            <TextInput
              value={symbolSearchQuery}
              onChangeText={setSymbolSearchQuery}
              placeholder="Search symbol or company"
              placeholderTextColor={inputPlaceholderTextColor}
              editable={!isSymbolLocked}
              className="mt-3 rounded-xl border border-app-highlight bg-brand-white px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark dark:bg-transparent dark:text-app-textDark"
            />

            {isSymbolLocked ? (
              <Text className="mt-2 text-xs font-semibold text-app-highlight dark:text-app-highlightDark">
                Symbol is locked from portfolio action.
              </Text>
            ) : null}

            <View className="mt-3 gap-2">
              {filteredSymbols.map((symbolItem) => (
                <TouchableOpacity
                  key={symbolItem.symbol}
                  activeOpacity={0.88}
                  disabled={isSymbolLocked}
                  onPress={() => handleSelectSymbol(symbolItem.symbol)}
                  className={[
                    "rounded-xl border px-3 py-2",
                    selectedSymbol === symbolItem.symbol
                      ? "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
                      : "border-app-highlight bg-brand-white dark:border-app-highlightDark dark:bg-transparent",
                    isSymbolLocked ? "opacity-60" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Text
                    className={[
                      "text-sm font-bold",
                      selectedSymbol === symbolItem.symbol
                        ? "text-brand-white dark:text-brand-purple"
                        : "text-app-text dark:text-app-textDark",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {symbolItem.symbol}
                  </Text>
                  <Text
                    className={[
                      "mt-1 text-xs",
                      selectedSymbol === symbolItem.symbol
                        ? "text-brand-white dark:text-brand-purple"
                        : "text-app-text dark:text-app-textDark",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    numberOfLines={1}
                  >
                    {symbolItem.name}
                  </Text>
                </TouchableOpacity>
              ))}

              {filteredSymbols.length === 0 ? (
                symbolSearchQuery.trim().length > 0 ? (
                  <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                    No symbols found.
                  </Text>
                ) : null
              ) : null}
            </View>

            <View className="mt-3 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
              <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                Last Price / Change
              </Text>
              <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                {formatPKRAmount(symbolQuote.lastPrice)}
              </Text>
              <Text
                className={[
                  "mt-1 text-sm font-semibold",
                  getChangeTextClassName(symbolQuote.change),
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {`${formatPKRAmount(symbolQuote.change)} (${formatSignedPercentage(symbolQuote.changePct)})`}
              </Text>
            </View>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                Trade Form
              </Text>

              <View className="flex-row items-center gap-2">
                <ToggleChip
                  label="Buy"
                  selected={tradeSide === "buy"}
                  onPress={() => setTradeSide("buy")}
                />
                <ToggleChip
                  label="Sell"
                  selected={tradeSide === "sell"}
                  selectedTone="danger"
                  onPress={() => setTradeSide("sell")}
                />
              </View>
            </View>

            <View className="mt-4 gap-3">
              <View className="flex-row gap-3">
                <FieldInput
                  label="Price"
                  value={priceInput}
                  onChangeText={(nextValue) => {
                    setHasEditedPrice(true);
                    setPriceInput(nextValue);
                  }}
                  placeholderTextColor={inputPlaceholderTextColor}
                  keyboardType="numeric"
                  placeholder="Auto from last price"
                />
                <FieldInput
                  label="Units"
                  value={unitsInput}
                  onChangeText={setUnitsInput}
                  placeholderTextColor={inputPlaceholderTextColor}
                  keyboardType="numeric"
                  placeholder="Shares"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Broker Mode
                  </Text>
                  <View className="mt-1 flex-row gap-2">
                    <ToggleChip
                      label="Saved"
                      selected={brokerMode === "saved"}
                      onPress={() => setBrokerMode("saved")}
                    />
                    <ToggleChip
                      label="Custom"
                      selected={brokerMode === "custom"}
                      onPress={() => setBrokerMode("custom")}
                    />
                  </View>
                </View>

                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Trade Date & Time
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={handleStartTradeDateTimeSelection}
                    className="mt-1 rounded-xl border border-app-highlight bg-brand-white px-3 py-2 dark:border-app-highlightDark dark:bg-transparent"
                  >
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      {formatDateTimeInput(tradeDateTime)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="flex-row gap-3">
                {brokerMode === "saved" ? (
                  <FieldInput
                    label="Broker"
                    value={SAVED_BROKER_LABEL}
                    placeholderTextColor={inputPlaceholderTextColor}
                    editable={false}
                  />
                ) : (
                  <FieldInput
                    label="Broker"
                    value={customBrokerNameInput}
                    onChangeText={setCustomBrokerNameInput}
                    placeholderTextColor={inputPlaceholderTextColor}
                    placeholder="Custom broker name"
                  />
                )}

                {brokerMode === "custom" ? (
                  <FieldInput
                    label="Broker Fee %"
                    value={customBrokerFeePctInput}
                    onChangeText={setCustomBrokerFeePctInput}
                    placeholderTextColor={inputPlaceholderTextColor}
                    keyboardType="numeric"
                    placeholder="e.g. 0.15"
                  />
                ) : (
                  <FieldInput
                    label="Broker Fee %"
                    value="From settings"
                    placeholderTextColor={inputPlaceholderTextColor}
                    editable={false}
                  />
                )}
              </View>
            </View>

            <View className="mt-5">
              <AppButton
                label={tradeSide === "buy" ? "Create Buy Order" : "Create Sell Order"}
                variant={tradeSide === "buy" ? "primary" : "danger"}
                loading={isSubmittingOrder}
                onPress={handleCreateOrder}
              />
            </View>

            {isTradeDateTimePickerVisible ? (
              <View className="mt-4 rounded-2xl border border-app-highlight bg-brand-white p-2 dark:border-app-highlightDark dark:bg-transparent">
                <Text className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  {isAwaitingTimeSelection ? "Pick Time" : "Pick Date"}
                </Text>
                <DateTimePicker
                  key={tradeDateTimePickerMode}
                  value={tradeDateTime}
                  mode={tradeDateTimePickerMode}
                  display="default"
                  onChange={handleTradeDateTimeChange}
                />
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
