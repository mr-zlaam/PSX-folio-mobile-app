import React from "react";
import { Stack } from "expo-router";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
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

  React.useEffect(() => {
    void SystemUI.setBackgroundColorAsync(stackBackgroundColor);
  }, [stackBackgroundColor]);

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        backgroundColor: stackBackgroundColor,
      }}
    >
      <BottomSheetModalProvider>
        <StatusBar
          style={isDarkMode ? "light" : "dark"}
          backgroundColor={stackBackgroundColor}
          translucent
        />
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
          <Stack.Screen name="market-index-stocks" />
          <Stack.Screen name="stock-detail" />
          <Stack.Screen name="pdf-viewer" />
          <Stack.Screen name="analytics" />
        </Stack>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
