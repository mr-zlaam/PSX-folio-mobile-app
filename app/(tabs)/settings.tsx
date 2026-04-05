import React from "react";
import { useGuardedRouter } from "@/src/lib/navigation";
import { useLocalSearchParams } from "expo-router";
import {
  InteractionManager,
  Modal,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useFocusEffect } from "@react-navigation/native";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppButton from "@/components/ui/app-button";
import AppFeedbackModal from "@/components/ui/app-feedback-modal";
import { AppSkeletonBlock } from "@/components/ui/app-skeleton";
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
  getDividendAutoReinvestEnabledPreference,
  getBrokerSettings,
  setDividendAutoReinvestEnabledPreference,
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
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  const trackOnColor = isDarkMode
    ? "rgba(255, 255, 255, 0.82)"
    : APP_COLORS.app.highlight;
  const trackOffColor = isDarkMode
    ? "rgba(255, 255, 255, 0.28)"
    : "rgba(20, 10, 38, 0.22)";
  const thumbColor = APP_COLORS.brand.white;

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
          thumbColor={thumbColor}
          ios_backgroundColor={trackOffColor}
          trackColor={{
            true: trackOnColor,
            false: trackOffColor,
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

  const feeText =
    brokerSettings.transactionFeeType === "fixed"
      ? `PKR ${brokerSettings.transactionFeeValue} fee`
      : `${brokerSettings.transactionFeeValue}% fee`;

  return `${brokerSettings.brokerName} • ${feeText}`;
}

export default function SettingsTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useGuardedRouter();
  const searchParams = useLocalSearchParams<{
    originTab?: string | string[];
  }>();
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const currentTheme: AppTheme = isDarkMode ? "dark" : "light";
  const routeOriginTab = React.useMemo(() => {
    const rawOriginTab = Array.isArray(searchParams.originTab)
      ? searchParams.originTab[0]
      : searchParams.originTab;
    return typeof rawOriginTab === "string" ? rawOriginTab.trim().toLowerCase() : "";
  }, [searchParams.originTab]);
  const shouldShowBackToMore = routeOriginTab === "more";
  const pendingThemeTaskRef = React.useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  const [themeSwitchValue, setThemeSwitchValue] = React.useState(
    currentTheme === "dark"
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [brokerSettings, setBrokerSettingsState] = React.useState<BrokerSettings | null>(
    null
  );
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

  const loadDividendAutoReinvestPreference = React.useCallback(async () => {
    const isEnabled = await getDividendAutoReinvestEnabledPreference();
    setDividendAutoReinvestEnabled(isEnabled);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadBrokerSettings();
      void loadDividendAutoReinvestPreference();
    }, [loadBrokerSettings, loadDividendAutoReinvestPreference])
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        getLatestKse100Summary(),
        getLatestSymbols(),
        loadBrokerSettings(),
        loadDividendAutoReinvestPreference(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    loadBrokerSettings,
    loadDividendAutoReinvestPreference,
  ]);

  const handleThemeChange = React.useCallback(
    (theme: AppTheme) => {
      setThemeSwitchValue(theme === "dark");
      pendingThemeTaskRef.current?.cancel();
      pendingThemeTaskRef.current = InteractionManager.runAfterInteractions(() => {
        setColorScheme(theme);
        void setThemePreference(theme).catch(() => {
          // Keep active theme change even if persistence fails.
        });
      });
    },
    [setColorScheme]
  );

  React.useEffect(() => {
    setThemeSwitchValue(currentTheme === "dark");
  }, [currentTheme]);

  React.useEffect(() => {
    return () => {
      pendingThemeTaskRef.current?.cancel();
    };
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
  const handleBackToMore = React.useCallback(() => {
    router.replace("/(tabs)/more");
  }, [router]);

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
          {shouldShowBackToMore ? (
            <View className="flex-row items-center">
              <AppBackIconButton onPress={handleBackToMore} />
            </View>
          ) : null}

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
              Settings
            </Text>
            <Text className="mt-2 text-base text-app-text dark:text-app-textDark">
              Manage appearance, broker profile, and portfolio options.
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
                value={themeSwitchValue}
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
              className="mt-4 rounded-xl border border-app-highlight/25 bg-app-highlight/5 px-3 py-2 dark:border-app-highlightDark/35 dark:bg-brand-white/5"
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
              Tax Settings
            </Text>
            <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
              Configure automatic tax deduction, mode, and rates.
            </Text>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push("/tax-settings")}
              className="mt-4 rounded-xl border border-app-highlight/25 bg-app-highlight/5 px-3 py-2 dark:border-app-highlightDark/35 dark:bg-brand-white/5"
            >
              <Text className="text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                Open Tax Settings
              </Text>
            </TouchableOpacity>
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
                      <AppSkeletonBlock
                        width={74}
                        height={10}
                        borderRadius={6}
                        className="bg-brand-white/40"
                      />
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
