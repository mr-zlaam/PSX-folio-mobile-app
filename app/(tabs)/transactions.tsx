import React from "react";
import {
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
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

function ToggleChip({
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
      onPress={onPress}
      activeOpacity={0.88}
      className={[
        "rounded-xl border px-3 py-2",
        selected
          ? "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
          : "border-app-highlight bg-button-neutral dark:border-app-highlightDark dark:bg-transparent",
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
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const [tradeSide, setTradeSide] = React.useState<TradeSide>("buy");
  const [brokerMode, setBrokerMode] = React.useState<BrokerMode>("saved");

  const [symbols, setSymbols] = React.useState<PsxSymbol[]>([]);
  const [symbolSearchQuery, setSymbolSearchQuery] = React.useState("SYS");
  const [selectedSymbol, setSelectedSymbol] = React.useState("SYS");
  const [symbolQuote, setSymbolQuote] = React.useState<SymbolQuote>(
    getSymbolQuoteFallback("SYS")
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

  const filteredSymbols = React.useMemo(() => {
    const normalizedQuery = symbolSearchQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return symbols.slice(0, 8);
    }

    return symbols
      .filter((symbolItem) => {
        const symbolMatch = symbolItem.symbol.toLowerCase().includes(normalizedQuery);
        const nameMatch = symbolItem.name.toLowerCase().includes(normalizedQuery);
        return symbolMatch || nameMatch;
      })
      .slice(0, 8);
  }, [symbolSearchQuery, symbols]);

  React.useEffect(() => {
    let isMounted = true;

    async function refreshSymbols() {
      const cachedSymbols = await getCachedSymbols();
      if (isMounted && cachedSymbols.length > 0) {
        setSymbols(cachedSymbols);
      }

      const latestSymbols = await getLatestSymbols();
      if (isMounted && latestSymbols.length > 0) {
        setSymbols(latestSymbols);
      }
    }

    void refreshSymbols();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    async function refreshQuote() {
      const cachedQuote = await getCachedSymbolQuote(selectedSymbol);
      if (isMounted && cachedQuote) {
        setSymbolQuote(cachedQuote);
      }

      const latestQuote = await getLatestSymbolQuote(selectedSymbol);
      if (isMounted) {
        setSymbolQuote(latestQuote);
      }
    }

    setSymbolQuote(getSymbolQuoteFallback(selectedSymbol));
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
              className="mt-3 rounded-xl border border-app-highlight bg-brand-white px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark dark:bg-transparent dark:text-app-textDark"
            />

            <View className="mt-3 gap-2">
              {filteredSymbols.map((symbolItem) => (
                <TouchableOpacity
                  key={symbolItem.symbol}
                  activeOpacity={0.88}
                  onPress={() => handleSelectSymbol(symbolItem.symbol)}
                  className={[
                    "rounded-xl border px-3 py-2",
                    selectedSymbol === symbolItem.symbol
                      ? "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
                      : "border-app-highlight bg-brand-white dark:border-app-highlightDark dark:bg-transparent",
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
                <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                  No symbols found.
                </Text>
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
                variant={tradeSide === "buy" ? "primary" : "secondary"}
                onPress={() => {
                  // Wire order submit in next step.
                }}
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
