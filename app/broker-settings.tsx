import React from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import AppButton from "@/components/ui/app-button";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppFeedbackModal, {
  AppFeedbackModalTone,
} from "@/components/ui/app-feedback-modal";
import {
  getBrokerSettings,
  setBrokerSettings,
} from "@/src/lib/app-preferences";
import { APP_COLORS } from "@/src/theme/colors";

type BrokerSettingsNotice = {
  title: string;
  message: string;
  tone: AppFeedbackModalTone;
};

export default function BrokerSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const placeholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;

  const [brokerNameInput, setBrokerNameInput] = React.useState("");
  const [transactionFeeInput, setTransactionFeeInput] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<BrokerSettingsNotice | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    async function hydrateBrokerSettings() {
      const savedBrokerSettings = await getBrokerSettings();
      if (!isMounted || !savedBrokerSettings) {
        return;
      }

      setBrokerNameInput(savedBrokerSettings.brokerName);
      setTransactionFeeInput(String(savedBrokerSettings.transactionFeePct));
    }

    void hydrateBrokerSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const showNotice = React.useCallback(
    (title: string, message: string, tone: AppFeedbackModalTone = "info") => {
      setNotice({
        title,
        message,
        tone,
      });
    },
    []
  );

  const handleSaveBrokerSettings = React.useCallback(async () => {
    const normalizedBrokerName = brokerNameInput.trim();
    if (normalizedBrokerName.length === 0) {
      showNotice("Broker Required", "Please enter your broker name.", "error");
      return;
    }

    const parsedTransactionFee = Number(transactionFeeInput.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedTransactionFee) || parsedTransactionFee < 0) {
      showNotice(
        "Invalid Transaction Fee",
        "Enter a valid transaction fee percentage (0 or above).",
        "error"
      );
      return;
    }

    setIsSaving(true);
    try {
      await setBrokerSettings({
        brokerName: normalizedBrokerName,
        transactionFeePct: parsedTransactionFee,
      });
      showNotice(
        "Broker Saved",
        "Broker settings were saved and will be used in trade form when Saved mode is selected.",
        "success"
      );
    } catch {
      showNotice(
        "Save Failed",
        "Could not save broker settings right now. Please try again.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }, [brokerNameInput, showNotice, transactionFeeInput]);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5">
          <View className="flex-row items-center justify-between">
            <AppBackIconButton onPress={() => router.back()} />

            <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Broker Settings
            </Text>

            <View className="w-14" />
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Default Broker
            </Text>
            <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
              These values are used automatically in trade form when Broker Mode is set
              to Saved.
            </Text>

            <View className="mt-4 gap-3">
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Broker Name
                </Text>
                <TextInput
                  value={brokerNameInput}
                  onChangeText={setBrokerNameInput}
                  placeholder="e.g. XYZ Securities"
                  placeholderTextColor={placeholderTextColor}
                  className="mt-1 rounded-xl border border-app-highlight/25 bg-app-highlight/5 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/35 dark:bg-brand-white/5 dark:text-app-textDark"
                />
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Transaction Fee %
                </Text>
                <TextInput
                  value={transactionFeeInput}
                  onChangeText={setTransactionFeeInput}
                  placeholder="e.g. 0.15"
                  placeholderTextColor={placeholderTextColor}
                  keyboardType="numeric"
                  className="mt-1 rounded-xl border border-app-highlight/25 bg-app-highlight/5 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/35 dark:bg-brand-white/5 dark:text-app-textDark"
                />
              </View>
            </View>

            <View className="mt-5">
              <AppButton
                label="Save Broker Settings"
                variant="primary"
                loading={isSaving}
                onPress={handleSaveBrokerSettings}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <AppFeedbackModal
        visible={notice !== null}
        title={notice?.title ?? ""}
        message={notice?.message ?? ""}
        tone={notice?.tone ?? "info"}
        actionLabel="Done"
        onClose={() => setNotice(null)}
      />
    </SafeAreaView>
  );
}
