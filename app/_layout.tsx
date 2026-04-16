import "@/src/lib/patch-touchable-ripple";
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
        />
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
