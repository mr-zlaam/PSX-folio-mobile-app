import React from "react";
import { Appearance, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useColorScheme } from "nativewind";
import OnboardingFlow from "@/src/features/onboarding/onboarding-flow";
import {
  AppTheme,
  clearThemePreference,
  getOnboardingComplete,
  getThemePreference,
  setOnboardingComplete,
  setThemePreference,
} from "@/src/lib/app-preferences";
import { ensureNotificationPermissionAtStartup } from "@/src/lib/notifications";

function getDeviceTheme(): AppTheme {
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

export default function IndexScreen() {
  const { setColorScheme } = useColorScheme();
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = React.useState(false);
  const [selectedTheme, setSelectedTheme] = React.useState<AppTheme>(getDeviceTheme());
  const hasBootstrappedRef = React.useRef(false);

  const applyTheme = React.useCallback(
    (theme: AppTheme) => {
      setSelectedTheme(theme);
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
        await ensureNotificationPermissionAtStartup();

        const storedTheme = await getThemePreference();
        const startupTheme = storedTheme ?? getDeviceTheme();
        applyTheme(startupTheme);

        const onboardingState = await getOnboardingComplete();
        if (isMounted) {
          setHasCompletedOnboarding(onboardingState);
        }
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

  const handleThemeSelect = React.useCallback(
    async (theme: AppTheme) => {
      applyTheme(theme);
      await setThemePreference(theme);
    },
    [applyTheme]
  );

  const handleSkipOnboarding = React.useCallback(async () => {
    const deviceTheme = getDeviceTheme();
    await clearThemePreference();
    await setOnboardingComplete(true);
    applyTheme(deviceTheme);
    setHasCompletedOnboarding(true);
  }, [applyTheme]);

  const handleCompleteOnboarding = React.useCallback(async () => {
    await setThemePreference(selectedTheme);
    await setOnboardingComplete(true);
    setHasCompletedOnboarding(true);
  }, [selectedTheme]);

  if (isBootstrapping) {
    return (
      <View className="flex-1 items-center justify-center bg-app-bg px-6 dark:bg-app-bgDark">
        <Text className="text-base font-semibold text-app-text dark:text-app-textDark">
          Preparing PSX Portfolio...
        </Text>
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return (
      <OnboardingFlow
        selectedTheme={selectedTheme}
        onThemeSelect={handleThemeSelect}
        onSkip={handleSkipOnboarding}
        onComplete={handleCompleteOnboarding}
      />
    );
  }

  return (
    <Redirect href="/(tabs)/home" />
  );
}
