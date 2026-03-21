import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useGuardedRouter } from "@/src/lib/navigation";

import { useColorScheme } from "nativewind";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { APP_COLORS } from "@/src/theme/colors";

type MoreGridItem = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  route:
    | "/(tabs)/market"
    | "/(tabs)/stocks"
    | "/(tabs)/settings"
    | "/(tabs)/transactions"
    | "/transaction-history"
    | "/broker-settings"
    | "/dividend"
    | "/deposit"
    | "/bonus-share"
    | "/analytics"
    | "/announcements"
    | "/notifications";
};

type MoreSection = {
  id: string;
  title: string;
  items: MoreGridItem[];
};

const TRADING_ITEMS: MoreGridItem[] = [
  {
    id: "trade",
    label: "Trade",
    icon: "swap-horizontal",
    route: "/(tabs)/transactions",
  },
  {
    id: "history",
    label: "History",
    icon: "history",
    route: "/transaction-history",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "chart-timeline-variant",
    route: "/analytics",
  },
];

const MARKET_ITEMS: MoreGridItem[] = [
  {
    id: "stocks",
    label: "Stocks",
    icon: "finance",
    route: "/(tabs)/stocks",
  },
  {
    id: "market",
    label: "Market",
    icon: "chart-box-outline",
    route: "/(tabs)/market",
  },
];

const NEWS_ITEMS: MoreGridItem[] = [
  {
    id: "announcements",
    label: "Notices",
    icon: "bullhorn-outline",
    route: "/announcements",
  },
  {
    id: "notifications",
    label: "Alerts",
    icon: "bell-outline",
    route: "/notifications",
  },
];

const PORTFOLIO_ACTION_ITEMS: MoreGridItem[] = [
  {
    id: "broker",
    label: "Broker",
    icon: "briefcase-outline",
    route: "/broker-settings",
  },
  {
    id: "deposit",
    label: "Deposit",
    icon: "cash-plus",
    route: "/deposit",
  },
  {
    id: "dividend",
    label: "Dividend",
    icon: "cash-multiple",
    route: "/dividend",
  },
  {
    id: "bonus-share",
    label: "Bonus",
    icon: "gift-outline",
    route: "/bonus-share",
  },
];

const PREFERENCES_ITEMS: MoreGridItem[] = [
  {
    id: "settings",
    label: "Settings",
    icon: "cog-outline",
    route: "/(tabs)/settings",
  },
];

const MORE_SECTIONS: MoreSection[] = [
  {
    id: "trading",
    title: "Trading",
    items: TRADING_ITEMS,
  },
  {
    id: "market",
    title: "Market",
    items: MARKET_ITEMS,
  },
  {
    id: "news",
    title: "News & Notices",
    items: NEWS_ITEMS,
  },
  {
    id: "portfolio-actions",
    title: "Portfolio Actions",
    items: PORTFOLIO_ACTION_ITEMS,
  },
  {
    id: "preferences",
    title: "Preferences",
    items: PREFERENCES_ITEMS,
  },
];

export default function MoreTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useGuardedRouter();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const iconColor = isDarkMode
    ? APP_COLORS.app.highlightDark
    : APP_COLORS.app.highlight;
  const handleOpenItem = React.useCallback(
    (item: MoreGridItem) => {
      if (item.id === "trade") {
        router.push({
          pathname: "/(tabs)/transactions",
          params: {
            lockSymbol: "0",
            originTab: "more",
          },
        });
        return;
      }

      router.push(item.route);
    },
    [router]
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <View
        className="flex-1 px-5 pt-3"
        style={{
          paddingBottom: insets.bottom + 12,
        }}
      >
        <View className="flex-1 rounded-3xl bg-brand-white px-4 pt-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
          <Text className="text-center text-2xl font-extrabold text-app-text dark:text-app-textDark">
            More
          </Text>
          <Text className="mt-1 text-center text-sm font-semibold text-app-text dark:text-app-textDark">
            Quick access to extra screens
          </Text>

          <ScrollView
            className="mt-5 flex-1"
            contentContainerStyle={{
              paddingBottom: 10,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-4">
              {MORE_SECTIONS.map((section) => (
                <View key={section.id}>
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    {section.title}
                  </Text>

                  <View className="mt-2 flex-row flex-wrap">
                    {section.items.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.88}
                        onPress={() => handleOpenItem(item)}
                        style={{ width: "33.333%" }}
                        className="p-1.5"
                      >
                        <View className="items-center rounded-2xl bg-brand-white/75 px-2 py-3 dark:bg-brand-white/5">
                          <View className="rounded-xl bg-app-highlight/10 p-2 dark:bg-brand-white/10">
                            <MaterialCommunityIcons
                              name={item.icon}
                              size={22}
                              color={iconColor}
                            />
                          </View>
                          <Text className="mt-2 text-center text-xs font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
                            {item.label}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}
