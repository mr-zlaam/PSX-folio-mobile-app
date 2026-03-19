import React from "react";
import { Text, View } from "react-native";
import { useColorScheme } from "nativewind";
import AppButton from "@/components/ui/app-button";
import "../global.css";

export default function TabLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [loading, setLoading] = React.useState(false);

  const toggleMode = React.useCallback(() => {
    const nextMode = colorScheme === "dark" ? "light" : "dark";
    setColorScheme(nextMode);
  }, [colorScheme, setColorScheme]);

  const handleReactivePress = React.useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 900);
  }, []);

  return (
    <View className="flex-1 bg-brand-white px-5 py-10 dark:bg-brand-purple">
      <View className="mb-8 gap-3">
        <Text className="text-3xl font-extrabold tracking-tight text-brand-purple dark:text-brand-white">
          PSX Portfolio
        </Text>
        <Text className="text-base text-text-light dark:text-text-dark">
          Button component preview for our app-wide UI.
        </Text>
      </View>

      <View className="gap-4">
        <AppButton
          label={`Switch to ${colorScheme === "dark" ? "Light" : "Dark"} Mode`}
          variant="secondary"
          fullWidth={false}
          onPress={toggleMode}
        />

        <AppButton
          label="Primary Action"
          variant="primary"
          onPress={handleReactivePress}
        />

        <AppButton
          label={loading ? "Processing..." : "Reactive Button Test"}
          variant="primary"
          loading={loading}
          onPress={handleReactivePress}
        />

        <AppButton
          label="Secondary Action"
          variant="secondary"
          onPress={toggleMode}
        />

        <AppButton
          label="Delete Trade"
          variant="danger"
          onPress={handleReactivePress}
        />
      </View>
    </View>
  );
}
