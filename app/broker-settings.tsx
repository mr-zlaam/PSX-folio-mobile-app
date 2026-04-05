import React from "react";
import { useGuardedRouter } from "@/src/lib/navigation";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import AppButton from "@/components/ui/app-button";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppFeedbackModal, {
  AppFeedbackModalTone,
} from "@/components/ui/app-feedback-modal";
import {
  BrokerProfileMode,
  getBrokerSettings,
  getDefaultBrokerSettings,
  setBrokerSettings,
} from "@/src/lib/app-preferences";
import {
  DEFAULT_BROKER_COMMISSION_PCT,
  DEFAULT_CDC_CHARGE_PER_SHARE,
  DEFAULT_SST_RATE_PCT,
} from "@/src/lib/broker-fee";
import { APP_COLORS } from "@/src/theme/colors";

type BrokerSettingsNotice = {
  title: string;
  message: string;
  tone: AppFeedbackModalTone;
};

function ModeChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className={[
        "rounded-xl px-3 py-2",
        selected
          ? "bg-app-highlight dark:bg-app-highlightDark"
          : "bg-brand-white/70 dark:bg-brand-white/5",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-xs font-bold uppercase tracking-wide",
          selected
            ? "text-brand-white dark:text-brand-purple"
            : "text-app-highlight dark:text-app-highlightDark",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function formatPkrValue(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "0";
}

export default function BrokerSettingsScreen() {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const placeholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;

  const [profileMode, setProfileMode] = React.useState<BrokerProfileMode>("default");
  const [brokerCommissionInput, setBrokerCommissionInput] = React.useState(
    String(DEFAULT_BROKER_COMMISSION_PCT)
  );
  const [cdcChargeInput, setCdcChargeInput] = React.useState(
    String(DEFAULT_CDC_CHARGE_PER_SHARE)
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<BrokerSettingsNotice | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    async function hydrateBrokerSettings() {
      const savedBrokerSettings = await getBrokerSettings();
      const effectiveSettings = savedBrokerSettings ?? getDefaultBrokerSettings();
      if (!isMounted) {
        return;
      }

      setProfileMode(effectiveSettings.profileMode);
      setBrokerCommissionInput(String(effectiveSettings.transactionFeeValue));
      setCdcChargeInput(String(effectiveSettings.cdcChargePerShare));
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

  const effectiveBrokerCommissionPct = React.useMemo(() => {
    if (profileMode === "default") {
      return DEFAULT_BROKER_COMMISSION_PCT;
    }

    const parsedValue = Number(brokerCommissionInput.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return 0;
    }

    return parsedValue;
  }, [brokerCommissionInput, profileMode]);

  const effectiveCdcChargePerShare = React.useMemo(() => {
    if (profileMode === "default") {
      return DEFAULT_CDC_CHARGE_PER_SHARE;
    }

    const parsedValue = Number(cdcChargeInput.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return 0;
    }

    return parsedValue;
  }, [cdcChargeInput, profileMode]);

  const handleSaveBrokerSettings = React.useCallback(async () => {
    let normalizedCommissionPct = DEFAULT_BROKER_COMMISSION_PCT;
    let normalizedCdcChargePerShare = DEFAULT_CDC_CHARGE_PER_SHARE;
    if (profileMode === "custom") {
      const parsedCommissionPct = Number(
        brokerCommissionInput.trim().replace(/,/g, "")
      );
      if (!Number.isFinite(parsedCommissionPct) || parsedCommissionPct < 0) {
        showNotice(
          "Invalid Broker Charges",
          "Enter a valid broker commission percentage (0 or above).",
          "error"
        );
        return;
      }
      normalizedCommissionPct = parsedCommissionPct;

      const parsedCdcChargePerShare = Number(cdcChargeInput.trim().replace(/,/g, ""));
      if (!Number.isFinite(parsedCdcChargePerShare) || parsedCdcChargePerShare < 0) {
        showNotice(
          "Invalid CDC Charges",
          "Enter a valid CDC amount per share (0 or above).",
          "error"
        );
        return;
      }
      normalizedCdcChargePerShare = parsedCdcChargePerShare;
    }

    setIsSaving(true);
    try {
      await setBrokerSettings({
        brokerName: profileMode === "custom" ? "Custom Broker" : "Default Broker",
        profileMode,
        transactionFeeType: "percentage",
        transactionFeeValue: normalizedCommissionPct,
        cdcChargePerShare: normalizedCdcChargePerShare,
      });
      showNotice(
        "Broker Settings Saved",
        "Trade screen will now use this broker profile for commission, SST, and CDC deductions.",
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
  }, [brokerCommissionInput, cdcChargeInput, profileMode, showNotice]);

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
              Broker Profile
            </Text>
            <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
              Choose Default or set your own custom broker commission percentage.
            </Text>

            <View className="mt-4 gap-3">
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Profile Mode
                </Text>
                <View className="mt-1 flex-row gap-2">
                  <ModeChip
                    label="Default"
                    selected={profileMode === "default"}
                    onPress={() => setProfileMode("default")}
                  />
                  <ModeChip
                    label="Custom"
                    selected={profileMode === "custom"}
                    onPress={() => setProfileMode("custom")}
                  />
                </View>
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Broker Commission %
                </Text>
                <TextInput
                  value={
                    profileMode === "default"
                      ? String(DEFAULT_BROKER_COMMISSION_PCT)
                      : brokerCommissionInput
                  }
                  onChangeText={setBrokerCommissionInput}
                  editable={profileMode === "custom"}
                  placeholder="e.g. 0.15"
                  placeholderTextColor={placeholderTextColor}
                  keyboardType="numeric"
                  className={[
                    "mt-1 rounded-xl px-3 py-2 text-sm font-semibold",
                    profileMode === "custom"
                      ? "bg-app-highlight/10 text-app-text dark:bg-brand-white/8 dark:text-app-textDark"
                      : "bg-brand-white/70 text-app-text/55 dark:bg-brand-white/12 dark:text-app-textDark/55",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                {profileMode === "default" ? (
                  <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                    Default mode locks commission at {DEFAULT_BROKER_COMMISSION_PCT}%.
                  </Text>
                ) : null}
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  CDC (PKR / Share)
                </Text>
                <TextInput
                  value={
                    profileMode === "default"
                      ? String(DEFAULT_CDC_CHARGE_PER_SHARE)
                      : cdcChargeInput
                  }
                  onChangeText={setCdcChargeInput}
                  editable={profileMode === "custom"}
                  placeholder="e.g. 0.005"
                  placeholderTextColor={placeholderTextColor}
                  keyboardType="numeric"
                  className={[
                    "mt-1 rounded-xl px-3 py-2 text-sm font-semibold",
                    profileMode === "custom"
                      ? "bg-app-highlight/10 text-app-text dark:bg-brand-white/8 dark:text-app-textDark"
                      : "bg-brand-white/70 text-app-text/55 dark:bg-brand-white/12 dark:text-app-textDark/55",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                {profileMode === "default" ? (
                  <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                    Default mode locks CDC at PKR {formatPkrValue(DEFAULT_CDC_CHARGE_PER_SHARE)} per share.
                  </Text>
                ) : null}
              </View>

              <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Charge Rules
                </Text>
                <View className="mt-2 gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                      Broker Commission
                    </Text>
                    <Text className="text-xs font-bold text-app-text dark:text-app-textDark">
                      {effectiveBrokerCommissionPct}%
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                      SST on Commission
                    </Text>
                    <Text className="text-xs font-bold text-app-text dark:text-app-textDark">
                      {DEFAULT_SST_RATE_PCT}%
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                      CDC (Per Share)
                    </Text>
                    <Text className="text-xs font-bold text-app-text dark:text-app-textDark">
                      PKR {formatPkrValue(effectiveCdcChargePerShare)}
                    </Text>
                  </View>
                </View>
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
