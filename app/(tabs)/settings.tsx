import React from "react";
import {
  ActivityIndicator,
  Modal,
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
import { useFocusEffect } from "@react-navigation/native";
import AppButton from "@/components/ui/app-button";
import AppFeedbackModal from "@/components/ui/app-feedback-modal";
import { APP_COLORS } from "@/src/theme/colors";
import { getLatestKse100Summary } from "@/src/features/home/home-data";
import { getLatestSymbols } from "@/src/features/trade/trade-data";
import {
  clearSavedTradeOrders,
} from "@/src/features/trade/trade-orders";
import {
  clearSavedDividendRecords,
} from "@/src/features/dividend/dividend-records";
import {
  clearSavedDepositRecords,
} from "@/src/features/deposit/deposit-records";
import {
  clearSavedBonusShareRecords,
} from "@/src/features/bonus-share/bonus-share-records";
import {
  emitPortfolioReset,
} from "@/src/features/trade/trade-events";
import {
  AppTheme,
  BrokerSettings,
  getCashGuardEnabledPreference,
  getDividendAutoReinvestEnabledPreference,
  getBrokerSettings,
  getTaxpayerProfilePreference,
  setCashGuardEnabledPreference,
  setDividendAutoReinvestEnabledPreference,
  setTaxpayerProfilePreference,
  TaxpayerProfile,
  setThemePreference,
} from "@/src/lib/app-preferences";

type ResetChallenge = {
  expression: string;
  answer: number;
};

type ResetNotice = {
  title: string;
  message: string;
  tone: "success" | "error" | "info";
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildResetChallenge(): ResetChallenge {
  const useAddition = Math.random() < 0.5;
  if (useAddition) {
    const first = randomInt(10, 69);
    const second = randomInt(1, 99 - first);
    return {
      expression: `${first} + ${second}`,
      answer: first + second,
    };
  }

  const first = randomInt(20, 99);
  const second = randomInt(1, first - 1);
  return {
    expression: `${first} - ${second}`,
    answer: first - second,
  };
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

function SettingSwitchRow({
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
    <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
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

function formatBrokerSummary(brokerSettings: BrokerSettings | null): string {
  if (!brokerSettings) {
    return "Not configured yet.";
  }

  return `${brokerSettings.brokerName} • ${brokerSettings.transactionFeePct}% fee`;
}

export default function SettingsTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const currentTheme: AppTheme = isDarkMode ? "dark" : "light";
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [brokerSettings, setBrokerSettingsState] = React.useState<BrokerSettings | null>(
    null
  );
  const [taxpayerProfile, setTaxpayerProfile] =
    React.useState<TaxpayerProfile>("nonFiler");
  const [cashGuardEnabled, setCashGuardEnabled] = React.useState(false);
  const [dividendAutoReinvestEnabled, setDividendAutoReinvestEnabled] =
    React.useState(false);
  const [isResetModalVisible, setIsResetModalVisible] = React.useState(false);
  const [resetChallenge, setResetChallenge] = React.useState<ResetChallenge>(() =>
    buildResetChallenge()
  );
  const [resetAnswerInput, setResetAnswerInput] = React.useState("");
  const [resetErrorText, setResetErrorText] = React.useState<string | null>(null);
  const [isResettingPortfolio, setIsResettingPortfolio] = React.useState(false);
  const [resetNotice, setResetNotice] = React.useState<ResetNotice | null>(null);

  const loadBrokerSettings = React.useCallback(async () => {
    const savedBrokerSettings = await getBrokerSettings();
    setBrokerSettingsState(savedBrokerSettings);
  }, []);

  const loadTaxpayerProfile = React.useCallback(async () => {
    const savedTaxpayerProfile = await getTaxpayerProfilePreference();
    setTaxpayerProfile(savedTaxpayerProfile);
  }, []);

  const loadCashGuardPreference = React.useCallback(async () => {
    const isEnabled = await getCashGuardEnabledPreference();
    setCashGuardEnabled(isEnabled);
  }, []);

  const loadDividendAutoReinvestPreference = React.useCallback(async () => {
    const isEnabled = await getDividendAutoReinvestEnabledPreference();
    setDividendAutoReinvestEnabled(isEnabled);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadBrokerSettings();
      void loadTaxpayerProfile();
      void loadCashGuardPreference();
      void loadDividendAutoReinvestPreference();
    }, [
      loadBrokerSettings,
      loadTaxpayerProfile,
      loadCashGuardPreference,
      loadDividendAutoReinvestPreference,
    ])
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        getLatestKse100Summary(),
        getLatestSymbols(),
        loadBrokerSettings(),
        loadTaxpayerProfile(),
        loadCashGuardPreference(),
        loadDividendAutoReinvestPreference(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    loadBrokerSettings,
    loadCashGuardPreference,
    loadTaxpayerProfile,
    loadDividendAutoReinvestPreference,
  ]);

  const handleThemeChange = React.useCallback(
    async (theme: AppTheme) => {
      setColorScheme(theme);
      try {
        await setThemePreference(theme);
      } catch {
        // Keep active theme change even if persistence fails.
      }
    },
    [setColorScheme]
  );

  const handleTaxpayerProfileChange = React.useCallback(
    async (nextProfile: TaxpayerProfile) => {
      setTaxpayerProfile(nextProfile);
      try {
        await setTaxpayerProfilePreference(nextProfile);
      } catch {
        // Keep selected value in UI even if persistence fails.
      }
    },
    []
  );

  const handleCashGuardToggle = React.useCallback(async (nextValue: boolean) => {
    setCashGuardEnabled(nextValue);
    try {
      await setCashGuardEnabledPreference(nextValue);
    } catch {
      // Keep selected value in UI even if persistence fails.
    }
  }, []);

  const handleDividendAutoReinvestToggle = React.useCallback(
    async (nextValue: boolean) => {
      setDividendAutoReinvestEnabled(nextValue);
      try {
        await setDividendAutoReinvestEnabledPreference(nextValue);
      } catch {
        // Keep selected value in UI even if persistence fails.
      }
    },
    []
  );

  const handleOpenResetModal = React.useCallback(() => {
    setResetChallenge(buildResetChallenge());
    setResetAnswerInput("");
    setResetErrorText(null);
    setIsResetModalVisible(true);
  }, []);

  const handleCloseResetModal = React.useCallback(() => {
    if (isResettingPortfolio) {
      return;
    }

    setIsResetModalVisible(false);
  }, [isResettingPortfolio]);

  const handleCloseResetNotice = React.useCallback(() => {
    setResetNotice(null);
  }, []);

  const handleConfirmPortfolioReset = React.useCallback(async () => {
    const normalizedAnswerInput = resetAnswerInput.trim();
    const parsedAnswer = Number(normalizedAnswerInput);
    if (
      normalizedAnswerInput.length === 0 ||
      !Number.isFinite(parsedAnswer) ||
      !Number.isInteger(parsedAnswer)
    ) {
      setResetErrorText("Please enter a valid whole-number answer.");
      return;
    }

    if (parsedAnswer !== resetChallenge.answer) {
      setResetChallenge(buildResetChallenge());
      setResetAnswerInput("");
      setResetErrorText("Incorrect answer. Solve the new question to continue.");
      return;
    }

    setIsResettingPortfolio(true);
    setResetErrorText(null);

    try {
      await Promise.all([
        clearSavedTradeOrders(),
        clearSavedDividendRecords(),
        clearSavedDepositRecords(),
        clearSavedBonusShareRecords(),
      ]);
      emitPortfolioReset({
        createdAt: new Date().toISOString(),
      });

      setIsResetModalVisible(false);
      setResetNotice({
        title: "Portfolio Reset Complete",
        message:
          "All buy, sell, dividend, deposit, and bonus share records were cleared from this device.",
        tone: "success",
      });
    } catch {
      setResetNotice({
        title: "Reset Failed",
        message: "Could not reset portfolio data. Please try again.",
        tone: "error",
      });
    } finally {
      setIsResettingPortfolio(false);
    }
  }, [resetAnswerInput, resetChallenge.answer]);

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
          paddingBottom: insets.bottom + 88,
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
          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
              Settings
            </Text>
            <Text className="mt-2 text-base text-app-text dark:text-app-textDark">
              Manage appearance, trading controls, and profile options.
            </Text>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Appearance
            </Text>
            <View className="mt-3">
              <SettingSwitchRow
                label="Dark Mode"
                description="Turn on dark mode for the whole app."
                value={currentTheme === "dark"}
                onValueChange={(nextValue) => {
                  void handleThemeChange(nextValue ? "dark" : "light");
                }}
              />
            </View>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Broker
            </Text>
            <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
              {formatBrokerSummary(brokerSettings)}
            </Text>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push("/broker-settings")}
              className="mt-4 rounded-xl border border-app-highlight px-3 py-2 dark:border-app-highlightDark"
            >
              <Text className="text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                Open Broker Settings
              </Text>
            </TouchableOpacity>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Trading Rules
            </Text>
            <View className="mt-3 gap-3">
              <SettingSwitchRow
                label="Cash Guard"
                description="Require available cash before creating buy orders."
                value={cashGuardEnabled}
                onValueChange={(nextValue) => {
                  void handleCashGuardToggle(nextValue);
                }}
              />
              <SettingSwitchRow
                label="Dividend Auto Reinvest"
                description="Automatically buy same-stock units from dividend; any remainder stays as free cash."
                value={dividendAutoReinvestEnabled}
                onValueChange={(nextValue) => {
                  void handleDividendAutoReinvestToggle(nextValue);
                }}
              />
            </View>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Tax Profile
            </Text>
            <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
              Filer: 15% CGT & dividend tax. Non-Filer: 30%.
            </Text>

            <View className="mt-3 flex-row gap-2">
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
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-brand-red">
              Data
            </Text>
            <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
              This permanently clears all buy, sell, dividend, deposit, and bonus share records from this device.
            </Text>

            <View className="mt-4">
              <AppButton
                label="Reset Portfolio"
                variant="danger"
                size="sm"
                onPress={handleOpenResetModal}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={isResetModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleCloseResetModal}
      >
        <View className="flex-1 items-center justify-center bg-brand-purple/70 px-6">
          <View className="w-full max-w-md rounded-3xl border border-app-highlight/20 bg-app-bg p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border-app-highlightDark/20 dark:bg-app-bgDark">
            <Text className="text-sm font-bold uppercase tracking-wide text-brand-red">
              Confirm Reset
            </Text>
            <Text className="mt-3 text-sm font-semibold text-app-text dark:text-app-textDark">
              Solve this question to continue:
            </Text>
            <Text className="mt-2 text-2xl font-extrabold text-app-text dark:text-app-textDark">
              {resetChallenge.expression} = ?
            </Text>

            <TextInput
              value={resetAnswerInput}
              onChangeText={setResetAnswerInput}
              placeholder="Enter answer"
              placeholderTextColor={inputPlaceholderTextColor}
              keyboardType="numeric"
              editable={!isResettingPortfolio}
              className="mt-4 rounded-xl border border-app-highlight bg-brand-white px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark dark:bg-transparent dark:text-app-textDark"
            />

            {resetErrorText ? (
              <Text className="mt-2 text-xs font-semibold text-brand-red">
                {resetErrorText}
              </Text>
            ) : null}

            <View className="mt-5 flex-row items-center gap-3">
              <View className="flex-1">
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={isResettingPortfolio}
                  onPress={handleCloseResetModal}
                  className="rounded-xl border border-app-highlight px-3 py-2 dark:border-app-highlightDark"
                >
                  <Text className="text-center text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="flex-1">
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={isResettingPortfolio}
                  onPress={() => {
                    void handleConfirmPortfolioReset();
                  }}
                  className={[
                    "rounded-xl bg-brand-red px-3 py-2",
                    isResettingPortfolio ? "opacity-70" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {isResettingPortfolio ? (
                    <View className="items-center justify-center">
                      <ActivityIndicator size="small" color={APP_COLORS.brand.white} />
                    </View>
                  ) : (
                    <Text className="text-center text-sm font-semibold text-brand-white">
                      Confirm Reset
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <AppFeedbackModal
        visible={resetNotice !== null}
        title={resetNotice?.title ?? ""}
        message={resetNotice?.message ?? ""}
        tone={resetNotice?.tone ?? "info"}
        actionLabel="Done"
        onClose={handleCloseResetNotice}
      />
    </SafeAreaView>
  );
}
