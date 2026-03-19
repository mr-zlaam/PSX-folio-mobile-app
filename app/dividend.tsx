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
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useColorScheme } from "nativewind";
import AppButton from "@/components/ui/app-button";
import AppFeedbackModal from "@/components/ui/app-feedback-modal";
import { formatPKRAmount } from "@/src/features/home/home-formatters";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
} from "@/src/features/portfolio/portfolio-data";
import { saveDividendRecord } from "@/src/features/dividend/dividend-records";
import { APP_COLORS } from "@/src/theme/colors";
import {
  getTaxpayerProfilePreference,
  TaxpayerProfile,
} from "@/src/lib/app-preferences";

type HoldingOption = {
  symbol: string;
  companyName: string;
  units: number;
};

function getDefaultTaxPctByProfile(profile: TaxpayerProfile): number {
  return profile === "filer" ? 15 : 30;
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEditableNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
}

function parseNonNegativeNumber(value: string): number {
  const parsed = Number(value.trim().replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
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

export default function DividendScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const [holdings, setHoldings] = React.useState<HoldingOption[]>([]);
  const [taxpayerProfile, setTaxpayerProfile] =
    React.useState<TaxpayerProfile>("nonFiler");
  const [symbolSearchQuery, setSymbolSearchQuery] = React.useState("");
  const [selectedSymbol, setSelectedSymbol] = React.useState("");
  const [sharesInput, setSharesInput] = React.useState("");
  const [dividendPerShareInput, setDividendPerShareInput] = React.useState("");
  const [taxDeductionPctInput, setTaxDeductionPctInput] = React.useState("30");
  const [zakatAmountInput, setZakatAmountInput] = React.useState("");
  const [dividendDate, setDividendDate] = React.useState(new Date());
  const [isDatePickerVisible, setIsDatePickerVisible] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [notice, setNotice] = React.useState<{
    title: string;
    message: string;
    tone: "success" | "error" | "info";
  } | null>(null);
  const [hasManuallyEditedTaxPct, setHasManuallyEditedTaxPct] =
    React.useState(false);

  const loadFormContext = React.useCallback(async () => {
    const [cachedHoldings, savedTaxpayerProfile] = await Promise.all([
      getPortfolioHoldingsWithCachedQuotes(),
      getTaxpayerProfilePreference(),
    ]);

    const normalizedCachedHoldings: HoldingOption[] = cachedHoldings
      .filter((holding) => holding.units > 0)
      .map((holding) => ({
        symbol: holding.symbol,
        companyName: holding.companyName,
        units: holding.units,
      }))
      .sort((firstHolding, secondHolding) =>
        firstHolding.symbol.localeCompare(secondHolding.symbol)
      );
    setHoldings(normalizedCachedHoldings);

    setTaxpayerProfile(savedTaxpayerProfile);
    if (!hasManuallyEditedTaxPct) {
      setTaxDeductionPctInput(String(getDefaultTaxPctByProfile(savedTaxpayerProfile)));
    }

    const latestHoldings = await getPortfolioHoldingsWithLatestQuotes();
    const normalizedLatestHoldings: HoldingOption[] = latestHoldings
      .filter((holding) => holding.units > 0)
      .map((holding) => ({
        symbol: holding.symbol,
        companyName: holding.companyName,
        units: holding.units,
      }))
      .sort((firstHolding, secondHolding) =>
        firstHolding.symbol.localeCompare(secondHolding.symbol)
      );
    setHoldings(normalizedLatestHoldings);
  }, [hasManuallyEditedTaxPct]);

  React.useEffect(() => {
    void loadFormContext();
  }, [loadFormContext]);

  const selectedHolding = React.useMemo(
    () => holdings.find((holding) => holding.symbol === selectedSymbol) ?? null,
    [holdings, selectedSymbol]
  );

  const filteredHoldings = React.useMemo(() => {
    const normalizedQuery = symbolSearchQuery.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return holdings.slice(0, 8);
    }

    return holdings
      .filter((holding) => {
        const symbolMatch = holding.symbol.toLowerCase().includes(normalizedQuery);
        const nameMatch = holding.companyName.toLowerCase().includes(normalizedQuery);
        return symbolMatch || nameMatch;
      })
      .slice(0, 8);
  }, [holdings, symbolSearchQuery]);

  const shares = React.useMemo(
    () => parseNonNegativeNumber(sharesInput),
    [sharesInput]
  );
  const dividendPerShare = React.useMemo(
    () => parseNonNegativeNumber(dividendPerShareInput),
    [dividendPerShareInput]
  );
  const taxDeductionPct = React.useMemo(
    () => parseNonNegativeNumber(taxDeductionPctInput),
    [taxDeductionPctInput]
  );
  const zakatAmount = React.useMemo(
    () => parseNonNegativeNumber(zakatAmountInput),
    [zakatAmountInput]
  );

  const grossAmount = React.useMemo(() => shares * dividendPerShare, [dividendPerShare, shares]);
  const taxDeductionAmount = React.useMemo(
    () => (grossAmount * taxDeductionPct) / 100,
    [grossAmount, taxDeductionPct]
  );
  const finalAmount = React.useMemo(
    () => grossAmount - taxDeductionAmount - zakatAmount,
    [grossAmount, taxDeductionAmount, zakatAmount]
  );

  const handleSelectHolding = React.useCallback((holding: HoldingOption) => {
    setSelectedSymbol(holding.symbol);
    setSymbolSearchQuery(holding.symbol);
    setSharesInput(formatEditableNumber(Math.round(holding.units)));
  }, []);

  const handleDateChange = React.useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (event.type === "dismissed" || !selectedDate) {
        setIsDatePickerVisible(false);
        return;
      }

      setDividendDate(selectedDate);
      if (Platform.OS === "android") {
        setIsDatePickerVisible(false);
      }
    },
    []
  );

  const showNotice = React.useCallback(
    (title: string, message: string, tone: "success" | "error" | "info") => {
      setNotice({ title, message, tone });
    },
    []
  );

  const closeNotice = React.useCallback(() => {
    setNotice(null);
  }, []);

  const handleSubmit = React.useCallback(async () => {
    if (selectedSymbol.trim().length === 0) {
      showNotice("Symbol Required", "Please select a stock symbol.", "error");
      return;
    }

    if (!selectedHolding || selectedHolding.units <= 0) {
      showNotice("Holding Missing", "You do not currently hold this symbol.", "error");
      return;
    }

    if (!Number.isInteger(shares) || shares <= 0) {
      showNotice("Invalid Shares", "Shares must be a whole number greater than 0.", "error");
      return;
    }

    if (shares > selectedHolding.units) {
      showNotice(
        "Shares Exceed Holding",
        `You can use up to ${Math.floor(selectedHolding.units)} shares for ${selectedHolding.symbol}.`,
        "error"
      );
      return;
    }

    if (dividendPerShare <= 0) {
      showNotice(
        "Invalid Dividend",
        "Dividend per share must be greater than 0.",
        "error"
      );
      return;
    }

    if (taxDeductionPct < 0) {
      showNotice("Invalid Tax", "Tax deduction % cannot be negative.", "error");
      return;
    }

    if (zakatAmount < 0) {
      showNotice("Invalid Zakat", "Zakat cannot be negative.", "error");
      return;
    }

    if (finalAmount <= 0) {
      showNotice(
        "Invalid Final Amount",
        "Final amount must be greater than 0 after deductions.",
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const savedRecord = await saveDividendRecord({
        symbol: selectedSymbol,
        shares,
        dividendPerShare,
        taxDeductionPct,
        taxDeductionAmount,
        zakatAmount,
        grossAmount,
        finalAmount,
        taxpayerProfile,
        dividendDate: dividendDate.toISOString(),
      });

      showNotice(
        "Dividend Added",
        `Dividend for ${savedRecord.symbol} saved successfully.\nFinal amount ${formatPKRAmount(savedRecord.finalAmount)} is now added to portfolio worth.`,
        "success"
      );

      setDividendPerShareInput("");
      setZakatAmountInput("");
      setDividendDate(new Date());
    } catch {
      showNotice(
        "Save Failed",
        "Could not save dividend entry. Please try again.",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedSymbol,
    selectedHolding,
    shares,
    dividendPerShare,
    taxDeductionPct,
    zakatAmount,
    finalAmount,
    taxDeductionAmount,
    grossAmount,
    taxpayerProfile,
    dividendDate,
    showNotice,
  ]);

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
              Add Dividend
            </Text>

            <View className="w-14" />
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Stock Symbol
            </Text>
            <TextInput
              value={symbolSearchQuery}
              onChangeText={setSymbolSearchQuery}
              placeholder="Search from your holdings"
              placeholderTextColor={inputPlaceholderTextColor}
              className="mt-3 rounded-xl border border-app-highlight bg-brand-white px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark dark:bg-transparent dark:text-app-textDark"
            />

            <View className="mt-3 gap-2">
              {filteredHoldings.map((holding) => (
                <TouchableOpacity
                  key={holding.symbol}
                  activeOpacity={0.88}
                  onPress={() => handleSelectHolding(holding)}
                  className={[
                    "rounded-xl border px-3 py-2",
                    selectedSymbol === holding.symbol
                      ? "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
                      : "border-app-highlight bg-brand-white dark:border-app-highlightDark dark:bg-transparent",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Text
                    className={[
                      "text-sm font-bold",
                      selectedSymbol === holding.symbol
                        ? "text-brand-white dark:text-brand-purple"
                        : "text-app-text dark:text-app-textDark",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {holding.symbol}
                  </Text>
                  <Text
                    className={[
                      "mt-1 text-xs font-semibold",
                      selectedSymbol === holding.symbol
                        ? "text-brand-white dark:text-brand-purple"
                        : "text-app-text dark:text-app-textDark",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {`${holding.companyName} • ${Math.floor(holding.units)} shares`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Dividend Form
            </Text>

            <View className="mt-4 gap-3">
              <View className="flex-row gap-3">
                <FieldInput
                  label="Number of Shares"
                  value={sharesInput}
                  onChangeText={setSharesInput}
                  placeholder="Auto from holdings"
                  placeholderTextColor={inputPlaceholderTextColor}
                  keyboardType="numeric"
                />
                <FieldInput
                  label="Dividend / Share"
                  value={dividendPerShareInput}
                  onChangeText={setDividendPerShareInput}
                  placeholder="e.g. 3.5"
                  placeholderTextColor={inputPlaceholderTextColor}
                  keyboardType="numeric"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                    {`Profile: ${taxpayerProfile === "filer" ? "Filer (15%)" : "Non-Filer (30%)"}`}
                  </Text>
                  <FieldInput
                    label="Tax Deduction %"
                    value={taxDeductionPctInput}
                    onChangeText={(nextValue) => {
                      setHasManuallyEditedTaxPct(true);
                      setTaxDeductionPctInput(nextValue);
                    }}
                    placeholderTextColor={inputPlaceholderTextColor}
                    keyboardType="numeric"
                  />
                </View>

                <View className="flex-1">
                  <Text className="mb-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                    Optional
                  </Text>
                  <FieldInput
                    label="Zakat"
                    value={zakatAmountInput}
                    onChangeText={setZakatAmountInput}
                    placeholder="0"
                    placeholderTextColor={inputPlaceholderTextColor}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Dividend Date
                </Text>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setIsDatePickerVisible(true)}
                  className="mt-1 rounded-xl border border-app-highlight bg-brand-white px-3 py-2 dark:border-app-highlightDark dark:bg-transparent"
                >
                  <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                    {formatDateInput(dividendDate)}
                  </Text>
                </TouchableOpacity>
                {isDatePickerVisible ? (
                  <View className="mt-3 rounded-xl border border-app-highlight bg-brand-white p-2 dark:border-app-highlightDark dark:bg-transparent">
                    <DateTimePicker
                      value={dividendDate}
                      mode="date"
                      display="default"
                      onChange={handleDateChange}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Final Amount
            </Text>
            <View className="mt-3 gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                  Gross Dividend
                </Text>
                <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                  {formatPKRAmount(grossAmount)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                  Tax Deduction
                </Text>
                <Text className="text-sm font-bold text-brand-red">
                  {formatPKRAmount(-taxDeductionAmount)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                  Zakat
                </Text>
                <Text className="text-sm font-bold text-brand-red">
                  {formatPKRAmount(-zakatAmount)}
                </Text>
              </View>
              <View className="mt-1 flex-row items-center justify-between rounded-xl bg-app-highlight/5 px-3 py-2 dark:bg-brand-white/5">
                <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                  Net to Portfolio
                </Text>
                <Text className="text-base font-extrabold text-success-green">
                  {formatPKRAmount(finalAmount)}
                </Text>
              </View>
            </View>
          </View>

          <AppButton
            label="Save Dividend"
            variant="primary"
            loading={isSubmitting}
            onPress={handleSubmit}
          />
        </View>
      </ScrollView>

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
