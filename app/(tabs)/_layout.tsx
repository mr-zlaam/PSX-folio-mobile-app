import { APP_COLORS } from "@/src/theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, useSegments } from "expo-router";
import { useColorScheme } from "nativewind";
import React from "react";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabIconName =
  | "view-dashboard-outline"
  | "chart-box-outline"
  | "briefcase-outline"
  | "eye-outline"
  | "swap-horizontal"
  | "dots-horizontal-circle-outline";

const MORE_MANAGED_ROUTES = new Set([
  "transactions",
  "stocks",
  "settings",
  "announcements",
  "notifications",
]);

function getTabIconName(routeName: string): TabIconName {
  if (routeName === "home") {
    return "view-dashboard-outline";
  }

  if (routeName === "portfolio") {
    return "briefcase-outline";
  }

  if (routeName === "market") {
    return "chart-box-outline";
  }

  if (routeName === "watchlist") {
    return "eye-outline";
  }

  if (routeName === "transactions") {
    return "swap-horizontal";
  }

  return "dots-horizontal-circle-outline";
}

function getTabLabel(routeName: string): string {
  if (routeName === "home") {
    return "Home";
  }

  if (routeName === "portfolio") {
    return "Portfolio";
  }

  if (routeName === "watchlist") {
    return "Watchlist";
  }

  if (routeName === "market") {
    return "Market";
  }

  return "More";
}

function getCurrentTabRouteName(segments: string[]): string {
  const filteredSegments = segments.filter((segment) => !segment.startsWith("("));
  if (filteredSegments.length === 0) {
    return "home";
  }

  return filteredSegments[0] ?? "home";
}

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const isDarkMode = colorScheme === "dark";
  const bottomInset = insets.bottom;
  const tabBarBottomPadding = bottomInset > 0 ? bottomInset : 8;
  const tabBarHeight = 60 + tabBarBottomPadding;
  const activeTintColor = isDarkMode
    ? APP_COLORS.brand.white
    : APP_COLORS.brand.purple;
  const inactiveTintColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const currentTabRouteName = React.useMemo(
    () => getCurrentTabRouteName(segments),
    [segments]
  );

  return (
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: activeTintColor,
        tabBarInactiveTintColor: inactiveTintColor,
        tabBarStyle: {
          backgroundColor: isDarkMode
            ? APP_COLORS.brand.purple
            : APP_COLORS.brand.white,
          borderTopWidth: 0,
          paddingTop: 8,
          paddingBottom: tabBarBottomPadding,
          height: tabBarHeight,
        },
        sceneStyle: {
          backgroundColor: isDarkMode
            ? APP_COLORS.app.bgDark
            : APP_COLORS.app.bg,
        },
        tabBarLabel: ({ focused }) => {
          const forceMoreHighlight =
            route.name === "more" && MORE_MANAGED_ROUTES.has(currentTabRouteName);
          const shouldHighlight = focused || forceMoreHighlight;
          return (
            <Text
              style={{
                fontWeight: "600",
                fontSize: 12,
                marginBottom: 6,
                color: shouldHighlight ? activeTintColor : inactiveTintColor,
              }}
            >
              {getTabLabel(route.name)}
            </Text>
          );
        },
        tabBarIcon: ({ color, focused }) => {
          const forceMoreHighlight =
            route.name === "more" && MORE_MANAGED_ROUTES.has(currentTabRouteName);
          const shouldHighlight = focused || forceMoreHighlight;
          return (
            <MaterialCommunityIcons
              name={getTabIconName(route.name)}
              size={22}
              color={shouldHighlight ? activeTintColor : color}
              style={{ opacity: shouldHighlight ? 1 : 0.85 }}
            />
          );
        },
      })}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: "Portfolio",
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: "Watchlist",
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: "Market",
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Trade",
          href: null,
        }}
      />
      <Tabs.Screen
        name="stocks"
        options={{
          title: "Stocks",
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          href: null,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
        }}
      />
    </Tabs>
  );
}
