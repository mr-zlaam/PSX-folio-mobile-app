import React from "react";
import {
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppButton from "@/components/ui/app-button";
import AppFeedbackModal from "@/components/ui/app-feedback-modal";
import { APP_COLORS } from "@/src/theme/colors";
import {
  getAutoTaxDeductionEnabledPreference,
  getCustomCgtTaxRatePreference,
  getCustomDividendTaxRatePreference,
  getDeductTaxFromCgtEnabledPreference,
  getDeductTaxFromDividendEnabledPreference,
  getDefaultTaxRateByProfile,
  getTaxComputationModePreference,
  getTaxpayerProfilePreference,
  setAutoTaxDeductionEnabledPreference,
  setCustomCgtTaxRatePreference,
  setCustomDividendTaxRatePreference,
  setDeductTaxFromCgtEnabledPreference,
  setDeductTaxFromDividendEnabledPreference,
  setTaxComputationModePreference,
  setTaxpayerProfilePreference,
  TaxComputationMode,
  TaxpayerProfile,
} from "@/src/lib/app-preferences";

function parseTaxRateInput(value: string): number | null {
  const parsed = Number(value.trim().replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

function formatTaxRateInput(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
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
      activeOpacity={0.88}
      onPress={onPress}
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

function TaxSwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (nextValue: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View
      className={[
        "rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5",
        disabled ? "opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
            {label}
          </Text>
          <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
            {description}
          </Text>
        </View>
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          thumbColor={APP_COLORS.brand.white}
          trackColor={{
            true: APP_COLORS.app.highlight,
            false: APP_COLORS.text.placeholderLight,
          }}
        />
      </View>
    </View>
  );
}

export default function TaxSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [autoTaxDeductionEnabled, setAutoTaxDeductionEnabled] =
    React.useState(true);
  const [deductTaxFromCgtEnabled, setDeductTaxFromCgtEnabled] =
    React.useState(true);
  const [deductTaxFromDividendEnabled, setDeductTaxFromDividendEnabled] =
    React.useState(true);
  const [taxComputationMode, setTaxComputationMode] =
    React.useState<TaxComputationMode>("default");
  const [taxpayerProfile, setTaxpayerProfile] =
    React.useState<TaxpayerProfile>("nonFiler");
  const [customCgtTaxRateInput, setCustomCgtTaxRateInput] = React.useState("");
  const [customDividendTaxRateInput, setCustomDividendTaxRateInput] =
    React.useState("");
  const [isSavingCustomRates, setIsSavingCustomRates] = React.useState(false);
  const [notice, setNotice] = React.useState<{
    title: string;
    message: string;
    tone: "success" | "error" | "info";
  } | null>(null);

  const loadTaxSettings = React.useCallback(async () => {
    const [
      savedAutoTaxDeductionEnabled,
      savedDeductTaxFromCgtEnabled,
      savedDeductTaxFromDividendEnabled,
      savedTaxComputationMode,
      savedTaxpayerProfile,
      savedCustomCgtTaxRate,
      savedCustomDividendTaxRate,
    ] = await Promise.all([
      getAutoTaxDeductionEnabledPreference(),
      getDeductTaxFromCgtEnabledPreference(),
      getDeductTaxFromDividendEnabledPreference(),
      getTaxComputationModePreference(),
      getTaxpayerProfilePreference(),
      getCustomCgtTaxRatePreference(),
      getCustomDividendTaxRatePreference(),
    ]);

    setAutoTaxDeductionEnabled(savedAutoTaxDeductionEnabled);
    setDeductTaxFromCgtEnabled(savedDeductTaxFromCgtEnabled);
    setDeductTaxFromDividendEnabled(savedDeductTaxFromDividendEnabled);
    setTaxComputationMode(savedTaxComputationMode);
    setTaxpayerProfile(savedTaxpayerProfile);
    setCustomCgtTaxRateInput(
      savedCustomCgtTaxRate === null
        ? ""
        : formatTaxRateInput(savedCustomCgtTaxRate)
    );
    setCustomDividendTaxRateInput(
      savedCustomDividendTaxRate === null
        ? ""
        : formatTaxRateInput(savedCustomDividendTaxRate)
    );
  }, []);

  React.useEffect(() => {
    void loadTaxSettings();
  }, [loadTaxSettings]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadTaxSettings();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadTaxSettings]);

  const handleAutoTaxDeductionToggle = React.useCallback(async (nextValue: boolean) => {
    setAutoTaxDeductionEnabled(nextValue);
    try {
      await setAutoTaxDeductionEnabledPreference(nextValue);
    } catch {
      // Keep current UI selection even if persistence fails.
    }
  }, []);

  const handleDeductTaxFromCgtToggle = React.useCallback(async (nextValue: boolean) => {
    setDeductTaxFromCgtEnabled(nextValue);
    try {
      await setDeductTaxFromCgtEnabledPreference(nextValue);
    } catch {
      // Keep current UI selection even if persistence fails.
    }
  }, []);

  const handleDeductTaxFromDividendToggle = React.useCallback(
    async (nextValue: boolean) => {
      setDeductTaxFromDividendEnabled(nextValue);
      try {
        await setDeductTaxFromDividendEnabledPreference(nextValue);
      } catch {
        // Keep current UI selection even if persistence fails.
      }
    },
    []
  );

  const handleTaxComputationModeChange = React.useCallback(
    async (nextMode: TaxComputationMode) => {
      setTaxComputationMode(nextMode);
      try {
        await setTaxComputationModePreference(nextMode);
      } catch {
        // Keep current UI selection even if persistence fails.
      }
    },
    []
  );

  const handleTaxpayerProfileChange = React.useCallback(
    async (nextProfile: TaxpayerProfile) => {
      setTaxpayerProfile(nextProfile);
      try {
        await setTaxpayerProfilePreference(nextProfile);
      } catch {
        // Keep current UI selection even if persistence fails.
      }
    },
    []
  );

  const handleSaveCustomTaxRates = React.useCallback(async () => {
    const parsedCustomCgtTaxRate = parseTaxRateInput(customCgtTaxRateInput);
    const parsedCustomDividendTaxRate = parseTaxRateInput(
      customDividendTaxRateInput
    );

    if (parsedCustomCgtTaxRate === null || parsedCustomDividendTaxRate === null) {
      setNotice({
        title: "Invalid Tax Rates",
        message:
          "Enter valid custom tax percentages between 0 and 100 for both CGT and dividend.",
        tone: "error",
      });
      return;
    }

    setIsSavingCustomRates(true);
    try {
      await Promise.all([
        setCustomCgtTaxRatePreference(parsedCustomCgtTaxRate),
        setCustomDividendTaxRatePreference(parsedCustomDividendTaxRate),
      ]);
      setCustomCgtTaxRateInput(formatTaxRateInput(parsedCustomCgtTaxRate));
      setCustomDividendTaxRateInput(
        formatTaxRateInput(parsedCustomDividendTaxRate)
      );
      setNotice({
        title: "Tax Rates Saved",
        message: "Custom CGT and dividend tax rates were updated successfully.",
        tone: "success",
      });
    } catch {
      setNotice({
        title: "Save Failed",
        message: "Could not save custom tax rates. Please try again.",
        tone: "error",
      });
    } finally {
      setIsSavingCustomRates(false);
    }
  }, [customCgtTaxRateInput, customDividendTaxRateInput]);

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
            <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Tax Settings
            </Text>
            <View className="w-14" />
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <TaxSwitchRow
              label="Enable Auto Tax Deduction"
              description="Turn this on to apply tax rules automatically on trade/dividend flows."
              value={autoTaxDeductionEnabled}
              onValueChange={(nextValue) => {
                void handleAutoTaxDeductionToggle(nextValue);
              }}
            />
          </View>

          <View
            pointerEvents={autoTaxDeductionEnabled ? "auto" : "none"}
            className={autoTaxDeductionEnabled ? "" : "opacity-55"}
          >
            <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
              <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                Tax Controls
              </Text>

              <View className="mt-3 gap-3">
                <TaxSwitchRow
                  label="Deduct Tax from CGT"
                  description="When enabled, tax is applied on profitable sell trades."
                  value={deductTaxFromCgtEnabled}
                  onValueChange={(nextValue) => {
                    void handleDeductTaxFromCgtToggle(nextValue);
                  }}
                />
                <TaxSwitchRow
                  label="Deduct Tax from Dividend"
                  description="When enabled, tax is deducted from dividend payouts."
                  value={deductTaxFromDividendEnabled}
                  onValueChange={(nextValue) => {
                    void handleDeductTaxFromDividendToggle(nextValue);
                  }}
                />
              </View>

              <Text className="mt-4 text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                Tax Mode
              </Text>
              <View className="mt-2 flex-row gap-2">
                <ToggleChip
                  label="Default"
                  selected={taxComputationMode === "default"}
                  onPress={() => {
                    void handleTaxComputationModeChange("default");
                  }}
                />
                <ToggleChip
                  label="Custom"
                  selected={taxComputationMode === "custom"}
                  onPress={() => {
                    void handleTaxComputationModeChange("custom");
                  }}
                />
              </View>

              {taxComputationMode === "default" ? (
                <View className="mt-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Taxpayer Profile
                  </Text>
                  <View className="mt-2 flex-row gap-2">
                    <ToggleChip
                      label="Filer"
                      selected={taxpayerProfile === "filer"}
                      onPress={() => {
                        void handleTaxpayerProfileChange("filer");
                      }}
                    />
                    <ToggleChip
                      label="Non-Filer"
                      selected={taxpayerProfile === "nonFiler"}
                      onPress={() => {
                        void handleTaxpayerProfileChange("nonFiler");
                      }}
                    />
                  </View>
                  <Text className="mt-3 text-xs font-semibold text-app-text dark:text-app-textDark">
                    Default rates: Filer {getDefaultTaxRateByProfile("filer")}%,
                    Non-Filer {getDefaultTaxRateByProfile("nonFiler")}%.
                  </Text>
                </View>
              ) : (
                <View className="mt-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Custom Tax Rates
                  </Text>

                  <View className="mt-2 flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                        CGT Tax %
                      </Text>
                      <TextInput
                        value={customCgtTaxRateInput}
                        onChangeText={setCustomCgtTaxRateInput}
                        keyboardType="numeric"
                        placeholder="e.g. 12.5"
                        placeholderTextColor={inputPlaceholderTextColor}
                        editable={!isSavingCustomRates}
                        className="mt-1 rounded-xl border border-app-highlight/15 bg-app-highlight/5 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/25 dark:bg-brand-white/5 dark:text-app-textDark"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                        Dividend Tax %
                      </Text>
                      <TextInput
                        value={customDividendTaxRateInput}
                        onChangeText={setCustomDividendTaxRateInput}
                        keyboardType="numeric"
                        placeholder="e.g. 10"
                        placeholderTextColor={inputPlaceholderTextColor}
                        editable={!isSavingCustomRates}
                        className="mt-1 rounded-xl border border-app-highlight/15 bg-app-highlight/5 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/25 dark:bg-brand-white/5 dark:text-app-textDark"
                      />
                    </View>
                  </View>

                  <View className="mt-4">
                    <AppButton
                      label="Save Custom Tax Rates"
                      variant="primary"
                      size="sm"
                      loading={isSavingCustomRates}
                      onPress={() => {
                        void handleSaveCustomTaxRates();
                      }}
                    />
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <AppFeedbackModal
        visible={notice !== null}
        title={notice?.title ?? ""}
        message={notice?.message ?? ""}
        tone={notice?.tone ?? "info"}
        actionLabel="Done"
        onClose={() => setNotice(null)}
      />
    </SafeAreaView>
  );
}
