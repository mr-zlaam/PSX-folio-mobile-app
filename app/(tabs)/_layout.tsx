import { APP_COLORS } from "@/src/theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabIconName =
  | "view-dashboard-outline"
  | "chart-box-outline"
  | "briefcase-outline"
  | "eye-outline"
  | "swap-horizontal"
  | "dots-horizontal-circle-outline";

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

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDarkMode = colorScheme === "dark";
  const bottomInset = insets.bottom;
  const tabBarBottomPadding = bottomInset > 0 ? bottomInset : 8;
  const tabBarHeight = 60 + tabBarBottomPadding;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: isDarkMode
          ? APP_COLORS.brand.white
          : APP_COLORS.brand.purple,
        tabBarInactiveTintColor: isDarkMode
          ? APP_COLORS.text.placeholderDark
          : APP_COLORS.text.placeholderLight,
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
        tabBarLabelStyle: {
          fontWeight: "700",
          fontSize: 12,
          marginBottom: 6,
        },
        tabBarIcon: ({ color, focused }) => (
          <MaterialCommunityIcons
            name={getTabIconName(route.name)}
            size={22}
            color={color}
            style={{ opacity: focused ? 1 : 0.75 }}
          />
        ),
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
          href: null,
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
