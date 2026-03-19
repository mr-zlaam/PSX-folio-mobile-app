import { Text, View } from "react-native";

export default function PortfolioTabScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-6 dark:bg-app-bgDark">
      <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
        Portfolio
      </Text>
      <Text className="mt-2 text-center text-base text-app-text dark:text-app-textDark">
        Portfolio details and allocation view will be added in the next phase.
      </Text>
    </View>
  );
}
