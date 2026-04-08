import AppBackIconButton from "@/components/ui/app-back-icon-button";
import { AppSkeletonBlock } from "@/components/ui/app-skeleton";
import { useGuardedRouter } from "@/src/lib/navigation";
import Constants from "expo-constants";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const PRIVACY_POLICY_URL = "https://psxfolio.netlify.app/privacy/";

export default function PrivacyPolicyScreen() {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();

  const appVersion = React.useMemo(() => {
    const configuredVersion = Constants.expoConfig?.version;
    if (
      typeof configuredVersion === "string" &&
      configuredVersion.trim().length > 0
    ) {
      return configuredVersion.trim();
    }

    return "Unknown";
  }, []);

  const [isWebViewLoading, setIsWebViewLoading] = React.useState(true);

  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <View className="flex-row items-center justify-between px-5 pt-3">
        <AppBackIconButton onPress={() => router.back()} />

        <Text
          numberOfLines={1}
          className="max-w-[68%] text-center text-lg font-extrabold text-app-text dark:text-app-textDark"
        >
          Privacy Policy
        </Text>

        <View className="w-14" />
      </View>

      <View
        className="flex-1 px-4"
        style={{
          paddingTop: 10,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <View className="flex-1 overflow-hidden rounded-3xl bg-brand-white/95 dark:bg-brand-white/10">
          <WebView
            source={{ uri: PRIVACY_POLICY_URL }}
            originWhitelist={["*"]}
            startInLoadingState
            renderLoading={() => (
              <View className="flex-1 px-4 py-4">
                <AppSkeletonBlock width="100%" height={14} borderRadius={7} />
                <AppSkeletonBlock
                  width="92%"
                  height={14}
                  borderRadius={7}
                  className="mt-3"
                />
                <AppSkeletonBlock
                  width="98%"
                  height={14}
                  borderRadius={7}
                  className="mt-3"
                />
                <AppSkeletonBlock
                  width="86%"
                  height={14}
                  borderRadius={7}
                  className="mt-3"
                />
              </View>
            )}
            onLoadStart={() => {
              setIsWebViewLoading(true);
            }}
            onLoadEnd={() => {
              setIsWebViewLoading(false);
            }}
            allowsBackForwardNavigationGestures
          />

          {isWebViewLoading ? (
            <View className="absolute right-3 top-3 rounded-xl bg-brand-white/90 px-2 py-1 dark:bg-brand-white/15">
              <AppSkeletonBlock width={66} height={10} borderRadius={6} />
            </View>
          ) : null}
        </View>

        <Text className="mt-2 text-center text-xs font-semibold text-app-text/75 dark:text-app-textDark/75">
          App Version: v{appVersion}
        </Text>
      </View>
    </SafeAreaView>
  );
}
