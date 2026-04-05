import React from "react";
import { Appearance, View } from "react-native";
import { Redirect } from "expo-router";
import { useColorScheme } from "nativewind";
import { AppSkeletonTextGroup } from "@/components/ui/app-skeleton";
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
        <View className="w-full max-w-[260px] rounded-2xl bg-brand-white/80 p-4 dark:bg-brand-white/10">
          <AppSkeletonTextGroup rows={3} rowHeight={12} />
        </View>
      </View>
    );
  }

  return (
    <Redirect href="/(tabs)/home" />
  );
}
