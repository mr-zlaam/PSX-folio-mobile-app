import { Text, View } from "react-native";

export default function TransactionsTabScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-6 dark:bg-app-bgDark">
      <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
        Trades
      </Text>
      <Text className="mt-2 text-center text-base text-app-text dark:text-app-textDark">
        Buy and sell transaction flows will be added in the next phase.
      </Text>
    </View>
  );
}
