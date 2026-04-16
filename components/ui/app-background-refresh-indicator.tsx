import { APP_COLORS } from "@/src/theme/colors";
import { useColorScheme } from "nativewind";
import React from "react";
import { Animated, Easing, Text, View } from "react-native";

export default function AppBackgroundRefreshIndicator({
  visible,
  label = "Updating",
}: {
  visible: boolean;
  label?: string;
}) {
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    let pulseLoop: Animated.CompositeAnimation | null = null;

    if (visible) {
      pulseAnim.setValue(0);
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
    }

    return () => {
      pulseLoop?.stop();
    };
  }, [pulseAnim, visible]);

  if (!visible) {
    return null;
  }

  const dotColor = isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple;

  return (
    <View className="flex-row items-center gap-1">
      <Animated.View
        style={{
          height: 5,
          width: 5,
          borderRadius: 999,
          backgroundColor: dotColor,
          opacity: pulseAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.35, 1],
          }),
          transform: [
            {
              scale: pulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.86, 1.16],
              }),
            },
          ],
        }}
      />
      <Text className="text-[10px] font-semibold text-app-text dark:text-app-textDark">
        {label}
      </Text>
    </View>
  );
}
