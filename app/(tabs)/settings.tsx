import { Text, View } from "react-native";

export default function SettingsTabScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-6 dark:bg-app-bgDark">
      <Text className="text-3xl font-extrabold text-app-text dark:text-app-textDark">
        Settings
      </Text>
      <Text className="mt-2 text-center text-base text-app-text dark:text-app-textDark">
        Broker profile and app preferences will be configured here soon.
      </Text>
    </View>
  );
}
