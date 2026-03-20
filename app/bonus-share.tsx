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
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppFeedbackModal from "@/components/ui/app-feedback-modal";
import {
  getCachedSymbols,
  getLatestSymbols,
  PsxSymbol,
} from "@/src/features/trade/trade-data";
import { saveBonusShareRecord } from "@/src/features/bonus-share/bonus-share-records";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
} from "@/src/features/portfolio/portfolio-data";
import { APP_COLORS } from "@/src/theme/colors";

type DateTimePickerMode = "date" | "time";

type HoldingOption = {
  symbol: string;
  units: number;
};

function formatDateTimeInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value.trim().replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return 0;
  }

  return parsed;
}

export default function BonusShareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const [symbols, setSymbols] = React.useState<PsxSymbol[]>([]);
  const [holdings, setHoldings] = React.useState<HoldingOption[]>([]);
  const [symbolSearchQuery, setSymbolSearchQuery] = React.useState("");
  const [selectedSymbol, setSelectedSymbol] = React.useState("");
  const [unitsInput, setUnitsInput] = React.useState("");
  const [awardedAt, setAwardedAt] = React.useState(new Date());
  const [pickerMode, setPickerMode] = React.useState<DateTimePickerMode>("date");
  const [isPickerVisible, setIsPickerVisible] = React.useState(false);
  const [isAwaitingTimeSelection, setIsAwaitingTimeSelection] =
    React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [notice, setNotice] = React.useState<{
    title: string;
    message: string;
    tone: "success" | "error" | "info";
  } | null>(null);

  const selectedHolding = React.useMemo(
    () =>
      holdings.find((holding) => holding.symbol === selectedSymbol.trim().toUpperCase()) ??
      null,
    [holdings, selectedSymbol]
  );
  const cardClassName =
    "rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/25 dark:shadow-none dark:bg-brand-white/10";
  const softInputClassName =
    "mt-1 rounded-xl border border-app-text/10 bg-brand-white/90 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/20 dark:bg-brand-white/10 dark:text-app-textDark";
  const searchInputClassName =
    "mt-3 rounded-xl border border-app-text/10 bg-brand-white/90 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/20 dark:bg-brand-white/10 dark:text-app-textDark";

  const loadFormContext = React.useCallback(async () => {
    const [cachedSymbols, cachedHoldings] = await Promise.all([
      getCachedSymbols(),
      getPortfolioHoldingsWithCachedQuotes(),
    ]);

    if (cachedSymbols.length > 0) {
      setSymbols(cachedSymbols);
    }

    if (cachedHoldings.length > 0) {
      setHoldings(
        cachedHoldings.map((holding) => ({
          symbol: holding.symbol,
          units: holding.units,
        }))
      );
    }

    const [latestSymbols, latestHoldings] = await Promise.all([
      getLatestSymbols(),
      getPortfolioHoldingsWithLatestQuotes(),
    ]);

    if (latestSymbols.length > 0) {
      setSymbols(latestSymbols);
    }

    setHoldings(
      latestHoldings.map((holding) => ({
        symbol: holding.symbol,
        units: holding.units,
      }))
    );
  }, []);

  React.useEffect(() => {
    void loadFormContext();
  }, [loadFormContext]);

  const filteredSymbols = React.useMemo(() => {
    const normalizedQuery = symbolSearchQuery.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return symbols.slice(0, 8);
    }

    return symbols
      .filter((symbol) => {
        const symbolMatch = symbol.symbol.toLowerCase().includes(normalizedQuery);
        const nameMatch = symbol.name.toLowerCase().includes(normalizedQuery);
        return symbolMatch || nameMatch;
      })
      .slice(0, 8);
  }, [symbolSearchQuery, symbols]);

  const parsedUnits = React.useMemo(() => parsePositiveInteger(unitsInput), [unitsInput]);

  const handleSelectSymbol = React.useCallback((symbol: string) => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    setSelectedSymbol(normalizedSymbol);
    setSymbolSearchQuery(normalizedSymbol);
  }, []);

  const handleStartDateTimeSelection = React.useCallback(() => {
    setPickerMode("date");
    setIsAwaitingTimeSelection(false);
    setIsPickerVisible(true);
  }, []);

  const handleDateTimeChange = React.useCallback(
    (event: DateTimePickerEvent, selectedValue?: Date) => {
      if (event.type === "dismissed" || !selectedValue) {
        setIsPickerVisible(false);
        setIsAwaitingTimeSelection(false);
        setPickerMode("date");
        return;
      }

      if (pickerMode === "date") {
        setAwardedAt((currentValue) => {
          const nextValue = new Date(currentValue);
          nextValue.setFullYear(
            selectedValue.getFullYear(),
            selectedValue.getMonth(),
            selectedValue.getDate()
          );
          return nextValue;
        });

        setPickerMode("time");
        setIsAwaitingTimeSelection(true);

        if (Platform.OS === "android") {
          setIsPickerVisible(false);
          setTimeout(() => {
            setIsPickerVisible(true);
          }, 0);
        }
        return;
      }

      setAwardedAt((currentValue) => {
        const nextValue = new Date(currentValue);
        nextValue.setHours(selectedValue.getHours(), selectedValue.getMinutes());
        return nextValue;
      });

      setIsPickerVisible(false);
      setIsAwaitingTimeSelection(false);
      setPickerMode("date");
    },
    [pickerMode]
  );

  const showNotice = React.useCallback(
    (title: string, message: string, tone: "success" | "error" | "info") => {
      setNotice({ title, message, tone });
    },
    []
  );

  const handleCloseNotice = React.useCallback(() => {
    setNotice(null);
  }, []);

  const handleSaveBonusShare = React.useCallback(async () => {
    const normalizedSymbol = selectedSymbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      showNotice("Symbol Required", "Please select a symbol.", "error");
      return;
    }

    if (parsedUnits <= 0) {
      showNotice("Invalid Units", "Units must be a whole number greater than 0.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const savedBonus = await saveBonusShareRecord({
        symbol: normalizedSymbol,
        units: parsedUnits,
        awardedAt: awardedAt.toISOString(),
      });

      showNotice(
        "Bonus Shares Added",
        `${savedBonus.units} bonus shares of ${savedBonus.symbol} added successfully.`,
        "success"
      );

      setUnitsInput("");
      setAwardedAt(new Date());
    } catch {
      showNotice("Save Failed", "Could not save bonus share. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }, [awardedAt, parsedUnits, selectedSymbol, showNotice]);

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
            <AppBackIconButton onPress={() => router.back()} />

            <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Bonus Shares
            </Text>

            <View className="w-14" />
          </View>

          <View className={cardClassName}>
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Symbol Search
            </Text>
            <TextInput
              value={symbolSearchQuery}
              onChangeText={setSymbolSearchQuery}
              placeholder="Search symbol or company"
              placeholderTextColor={inputPlaceholderTextColor}
              className={searchInputClassName}
            />

            <View className="mt-3 gap-2">
              {filteredSymbols.map((symbol) => (
                <TouchableOpacity
                  key={symbol.symbol}
                  activeOpacity={0.88}
                  onPress={() => handleSelectSymbol(symbol.symbol)}
                  className={[
                    "rounded-xl border px-3 py-2",
                    selectedSymbol === symbol.symbol
                      ? "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
                      : "border-app-text/10 bg-brand-white/90 dark:border-app-highlightDark/20 dark:bg-brand-white/10",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Text
                    className={[
                      "text-sm font-bold",
                      selectedSymbol === symbol.symbol
                        ? "text-brand-white dark:text-brand-purple"
                        : "text-app-text dark:text-app-textDark",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {symbol.symbol}
                  </Text>
                  <Text
                    className={[
                      "mt-1 text-xs font-semibold",
                      selectedSymbol === symbol.symbol
                        ? "text-brand-white dark:text-brand-purple"
                        : "text-app-text dark:text-app-textDark",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    numberOfLines={1}
                  >
                    {symbol.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="mt-3 text-xs font-semibold text-app-text dark:text-app-textDark">
              Current Holding: {selectedHolding ? `${Math.round(selectedHolding.units)} shares` : "N/A"}
            </Text>
          </View>

          <View className={cardClassName}>
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Bonus Details
            </Text>

            <View className="mt-4 gap-3">
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Bonus Units
                </Text>
                <TextInput
                  value={unitsInput}
                  onChangeText={setUnitsInput}
                  placeholder="e.g. 10"
                  placeholderTextColor={inputPlaceholderTextColor}
                  keyboardType="numeric"
                  className={softInputClassName}
                />
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Date & Time
                </Text>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleStartDateTimeSelection}
                  className="mt-1 rounded-xl border border-app-text/10 bg-brand-white/90 px-3 py-2 dark:border-app-highlightDark/20 dark:bg-brand-white/10"
                >
                  <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                    {formatDateTimeInput(awardedAt)}
                  </Text>
                </TouchableOpacity>

                {isPickerVisible ? (
                  <View className="mt-3 rounded-xl border border-app-text/10 bg-brand-white/90 p-2 dark:border-app-highlightDark/20 dark:bg-brand-white/10">
                    <Text className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                      {isAwaitingTimeSelection ? "Pick Time" : "Pick Date"}
                    </Text>
                    <DateTimePicker
                      key={pickerMode}
                      value={awardedAt}
                      mode={pickerMode}
                      display="default"
                      onChange={handleDateTimeChange}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <AppButton
            label="Save Bonus Shares"
            variant="primary"
            loading={isSubmitting}
            onPress={handleSaveBonusShare}
          />
        </View>
      </ScrollView>

      <AppFeedbackModal
        visible={notice !== null}
        title={notice?.title ?? ""}
        message={notice?.message ?? ""}
        tone={notice?.tone ?? "info"}
        actionLabel="Done"
        onClose={handleCloseNotice}
      />
    </SafeAreaView>
  );
}
