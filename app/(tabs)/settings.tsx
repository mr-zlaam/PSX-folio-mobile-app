import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { APP_COLORS } from "@/src/theme/colors";
import { getLatestKse100Summary } from "@/src/features/home/home-data";
import { getLatestSymbols } from "@/src/features/trade/trade-data";

export default function SettingsTabScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastSyncAt, setLastSyncAt] = React.useState<string | null>(null);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([getLatestKse100Summary(), getLatestSymbols()]);
      setLastSyncAt(new Date().toISOString());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

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
        <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
          <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
            Settings
          </Text>
          <Text className="mt-2 text-base text-app-text dark:text-app-textDark">
            Pull down to refresh latest market snapshots and symbol cache.
          </Text>
          <Text className="mt-3 text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
            {lastSyncAt
              ? `Last refreshed: ${new Date(lastSyncAt).toLocaleString()}`
              : "No manual refresh yet."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
