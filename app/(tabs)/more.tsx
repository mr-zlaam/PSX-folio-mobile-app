import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
    | "/(tabs)/settings"
    | "/(tabs)/transactions"
    | "/transaction-history"
    | "/broker-settings"
    | "/dividend"
    | "/deposit"
    | "/bonus-share";
};

const MORE_GRID_ITEMS: MoreGridItem[] = [
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
  {
    id: "settings",
    label: "Settings",
    icon: "cog-outline",
    route: "/(tabs)/settings",
  },
];

export default function MoreTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const iconColor = isDarkMode
    ? APP_COLORS.app.highlightDark
    : APP_COLORS.app.highlight;

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          paddingTop: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-3xl bg-brand-white px-4 py-5 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
          <Text className="text-center text-2xl font-extrabold text-app-text dark:text-app-textDark">
            More
          </Text>
          <Text className="mt-1 text-center text-sm font-semibold text-app-text dark:text-app-textDark">
            Quick access to extra screens
          </Text>

          <View className="mt-5 flex-row flex-wrap justify-between gap-y-3">
            {MORE_GRID_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.88}
                onPress={() => router.push(item.route)}
                style={{ width: "31%" }}
                className="items-center rounded-2xl bg-brand-white/75 px-2 py-3 dark:bg-brand-white/5"
              >
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
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
