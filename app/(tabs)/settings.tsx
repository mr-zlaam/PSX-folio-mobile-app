import React from "react";
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useFocusEffect } from "@react-navigation/native";
import { APP_COLORS } from "@/src/theme/colors";
import { getLatestKse100Summary } from "@/src/features/home/home-data";
import { getLatestSymbols } from "@/src/features/trade/trade-data";
import {
  AppTheme,
  BrokerSettings,
  getBrokerSettings,
  getTaxpayerProfilePreference,
  setTaxpayerProfilePreference,
  TaxpayerProfile,
  setThemePreference,
} from "@/src/lib/app-preferences";

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
  const currentTheme: AppTheme = isDarkMode ? "dark" : "light";
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [brokerSettings, setBrokerSettingsState] = React.useState<BrokerSettings | null>(
    null
  );
  const [taxpayerProfile, setTaxpayerProfile] =
    React.useState<TaxpayerProfile>("nonFiler");

  const loadBrokerSettings = React.useCallback(async () => {
    const savedBrokerSettings = await getBrokerSettings();
    setBrokerSettingsState(savedBrokerSettings);
  }, []);

  const loadTaxpayerProfile = React.useCallback(async () => {
    const savedTaxpayerProfile = await getTaxpayerProfilePreference();
    setTaxpayerProfile(savedTaxpayerProfile);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadBrokerSettings();
      void loadTaxpayerProfile();
    }, [loadBrokerSettings, loadTaxpayerProfile])
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        getLatestKse100Summary(),
        getLatestSymbols(),
        loadBrokerSettings(),
        loadTaxpayerProfile(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadBrokerSettings, loadTaxpayerProfile]);

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
          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
            <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
              Settings
            </Text>
            <Text className="mt-2 text-base text-app-text dark:text-app-textDark">
              Manage app preferences and broker defaults.
            </Text>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Theme
            </Text>
            <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
              Choose how app looks.
            </Text>

            <View className="mt-3 flex-row gap-2">
              <ToggleChip
                label="Light"
                selected={currentTheme === "light"}
                onPress={() => {
                  void handleThemeChange("light");
                }}
              />
              <ToggleChip
                label="Dark"
                selected={currentTheme === "dark"}
                onPress={() => {
                  void handleThemeChange("dark");
                }}
              />
            </View>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Broker Settings
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

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
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

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
