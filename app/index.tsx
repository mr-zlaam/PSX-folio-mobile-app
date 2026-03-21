import React from "react";
import { Appearance, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  AppTheme,
  getThemePreference,
} from "@/src/lib/app-preferences";

function getDeviceTheme(): AppTheme {
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

export default function IndexScreen() {
  const { setColorScheme } = useColorScheme();
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);
  const hasBootstrappedRef = React.useRef(false);

  const applyTheme = React.useCallback(
    (theme: AppTheme) => {
      setColorScheme(theme);
    },
    [setColorScheme]
  );

  React.useEffect(() => {
    if (hasBootstrappedRef.current) {
      return;
    }
    hasBootstrappedRef.current = true;

    let isMounted = true;

    async function bootstrap() {
      try {
        const storedTheme = await getThemePreference();
        const startupTheme = storedTheme ?? getDeviceTheme();
        applyTheme(startupTheme);
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [applyTheme]);

  if (isBootstrapping) {
    return (
      <View className="flex-1 items-center justify-center bg-app-bg px-6 dark:bg-app-bgDark">
        <Text className="text-base font-semibold text-app-text dark:text-app-textDark">
          Preparing PSX Portfolio...
        </Text>
      </View>
    );
  }

  return (
    <Redirect href="/(tabs)/home" />
  );
}
