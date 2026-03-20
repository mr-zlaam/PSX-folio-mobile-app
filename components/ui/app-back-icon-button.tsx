import { APP_COLORS } from "@/src/theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import React from "react";
import { TouchableOpacity } from "react-native";

type AppBackIconButtonProps = {
  onPress: () => void;
  accessibilityLabel?: string;
};

export default function AppBackIconButton({
  onPress,
  accessibilityLabel = "Go back",
}: AppBackIconButtonProps) {
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="h-10 w-14 items-center justify-center rounded-xl"
    >
      <MaterialCommunityIcons
        name="arrow-left"
        size={20}
        color={isDarkMode ? APP_COLORS.app.highlightDark : APP_COLORS.app.highlight}
      />
    </TouchableOpacity>
  );
}
