import React from "react";
import { Modal, Text, View } from "react-native";
import AppButton from "@/components/ui/app-button";
import RippleTouchableOpacity from "@/components/ui/ripple-touchable-opacity";

export type AppFeedbackModalTone = "success" | "error" | "info";

type AppFeedbackModalProps = {
  visible: boolean;
  title: string;
  message: string;
  tone?: AppFeedbackModalTone;
  actionLabel?: string;
  onClose: () => void;
};

function getBadgeClassName(tone: AppFeedbackModalTone): string {
  if (tone === "success") {
    return "bg-success-green/15";
  }

  if (tone === "error") {
    return "bg-brand-red/15";
  }

  return "bg-app-highlight/15 dark:bg-app-highlightDark/15";
}

function getBadgeTextClassName(tone: AppFeedbackModalTone): string {
  if (tone === "success") {
    return "text-success-green";
  }

  if (tone === "error") {
    return "text-brand-red";
  }

  return "text-app-highlight dark:text-app-highlightDark";
}

function getActionVariant(tone: AppFeedbackModalTone): "primary" | "danger" {
  return tone === "error" ? "danger" : "primary";
}

export default function AppFeedbackModal({
  visible,
  title,
  message,
  tone = "info",
  actionLabel = "OK",
  onClose,
}: AppFeedbackModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-brand-purple/70 px-6">
        <View className="w-full max-w-md rounded-3xl border border-app-highlight/20 bg-app-bg p-5 shadow-sm dark:border-app-highlightDark/20 dark:bg-app-bgDark">
          <View className="flex-row items-start justify-between gap-3">
            <View className={["rounded-xl px-3 py-1.5", getBadgeClassName(tone)].join(" ")}>
              <Text
                className={[
                  "text-xs font-bold uppercase tracking-wide",
                  getBadgeTextClassName(tone),
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {tone}
              </Text>
            </View>

            <RippleTouchableOpacity
              onPress={onClose}
              activeOpacity={0.88}
              className="overflow-hidden rounded-xl border border-app-highlight px-3 py-1 dark:border-app-highlightDark"
            >
              <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                Close
              </Text>
            </RippleTouchableOpacity>
          </View>

          <Text className="mt-4 text-xl font-extrabold text-app-text dark:text-app-textDark">
            {title}
          </Text>
          <Text className="mt-2 text-sm font-semibold leading-6 text-app-text dark:text-app-textDark">
            {message}
          </Text>

          <View className="mt-5">
            <AppButton
              label={actionLabel}
              size="sm"
              variant={getActionVariant(tone)}
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
