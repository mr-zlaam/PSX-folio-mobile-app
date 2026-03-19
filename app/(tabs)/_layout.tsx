import { APP_COLORS } from "@/src/theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabIconName =
  | "view-dashboard-outline"
  | "briefcase-outline"
  | "swap-horizontal"
  | "cog-outline";

function getTabIconName(routeName: string): TabIconName {
  if (routeName === "home") {
    return "view-dashboard-outline";
  }

  if (routeName === "portfolio") {
    return "briefcase-outline";
  }

  if (routeName === "transactions") {
    return "swap-horizontal";
  }

  return "cog-outline";
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
          ? APP_COLORS.brand.white
          : APP_COLORS.text.light,
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
        name="transactions"
        options={{
          title: "Trade",
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
        }}
      />
    </Tabs>
  );
}
