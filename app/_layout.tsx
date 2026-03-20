import { Stack } from "expo-router";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme } from "nativewind";
import { APP_COLORS } from "@/src/theme/colors";
import "../global.css";

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const stackBackgroundColor = isDarkMode
    ? APP_COLORS.app.bgDark
    : APP_COLORS.app.bg;

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        backgroundColor: stackBackgroundColor,
      }}
    >
      <BottomSheetModalProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: stackBackgroundColor,
            },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="portfolio-position" />
          <Stack.Screen name="portfolio-sector" />
          <Stack.Screen name="broker-settings" />
          <Stack.Screen name="dividend" />
          <Stack.Screen name="deposit" />
          <Stack.Screen name="bonus-share" />
          <Stack.Screen name="transaction-history" />
          <Stack.Screen name="market-index" />
          <Stack.Screen name="stock-detail" />
        </Stack>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
