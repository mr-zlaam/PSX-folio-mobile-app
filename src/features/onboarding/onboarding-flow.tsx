import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppButton from "@/components/ui/app-button";
import { AppTheme } from "@/src/lib/app-preferences";

type OnboardingFlowProps = {
  selectedTheme: AppTheme;
  onThemeSelect: (theme: AppTheme) => void;
  onSkip: () => void;
  onComplete: () => void;
};

const TOTAL_STEPS = 2;

type ThemeOptionCardProps = {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
};

function ThemeOptionCard({
  title,
  description,
  selected,
  onPress,
}: ThemeOptionCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      className={[
        "rounded-2xl px-4 py-4",
        selected ? "border-2 border-app-highlight dark:border-app-highlightDark" : "border border-app-highlight dark:border-app-highlightDark",
        "bg-button-neutral dark:bg-transparent",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
        {title}
      </Text>
      <Text className="mt-1 text-sm text-app-text dark:text-app-textDark">
        {description}
      </Text>
      <Text className="mt-3 text-xs font-semibold text-app-highlight dark:text-app-highlightDark">
        {selected ? "Selected" : "Tap to select"}
      </Text>
    </TouchableOpacity>
  );
}

export default function OnboardingFlow({
  selectedTheme,
  onThemeSelect,
  onSkip,
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = React.useState(0);
  const isLastStep = step === TOTAL_STEPS - 1;

  const handlePrimaryAction = React.useCallback(() => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setStep((currentStep) => currentStep + 1);
  }, [isLastStep, onComplete]);

  return (
    <SafeAreaView className="flex-1 bg-app-bg px-5 pb-6 pt-2 dark:bg-app-bgDark">
      <View className="mb-4 flex-row justify-end">
        <TouchableOpacity
          onPress={onSkip}
          activeOpacity={0.9}
          className="rounded-xl border border-app-highlight px-3 py-2 dark:border-app-highlightDark"
        >
          <Text className="text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
            Skip
          </Text>
        </TouchableOpacity>
      </View>

      <View className="mb-6 flex-row gap-2">
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
          <View
            key={index}
            className={[
              "h-2 rounded-full",
              index === step ? "w-8 bg-app-highlight dark:bg-app-highlightDark" : "w-2 bg-app-highlight dark:bg-app-highlightDark",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
      </View>

      <View className="flex-1 justify-between">
        <View className="gap-5">
          {step === 0 ? (
            <>
              <View className="self-start rounded-2xl border border-app-highlight px-3 py-2 dark:border-app-highlightDark">
                <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                  Welcome
                </Text>
              </View>

              <View className="gap-3">
                <Text className="text-4xl font-extrabold leading-tight text-app-text dark:text-app-textDark">
                  Welcome to PSX Portfolio
                </Text>
                <Text className="text-base leading-6 text-app-text dark:text-app-textDark">
                  Track your Pakistan Stock Exchange holdings, monitor returns,
                  and manage trades in one clean app.
                </Text>
              </View>

              <View className="rounded-3xl border border-app-highlight bg-button-neutral p-4 dark:border-app-highlightDark dark:bg-transparent">
                <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                  What you can do
                </Text>
                <View className="mt-3 gap-2">
                  <Text className="text-sm text-app-text dark:text-app-textDark">
                    Track PSX positions with accurate cost basis.
                  </Text>
                  <Text className="text-sm text-app-text dark:text-app-textDark">
                    Analyze gains and losses in real time.
                  </Text>
                  <Text className="text-sm text-app-text dark:text-app-textDark">
                    Keep your watchlist and portfolio organized.
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <View className="self-start rounded-2xl border border-app-highlight px-3 py-2 dark:border-app-highlightDark">
                <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                  Theme
                </Text>
              </View>

              <View className="gap-2">
                <Text className="text-3xl font-extrabold leading-tight text-app-text dark:text-app-textDark">
                  Pick your theme
                </Text>
                <Text className="text-base leading-6 text-app-text dark:text-app-textDark">
                  Choose how PSX Portfolio looks. We will save your preference
                  and apply it automatically on next launch.
                </Text>
              </View>

              <View className="gap-3">
                <ThemeOptionCard
                  title="Dark Mode"
                  description="Dark purple surface with high-contrast text."
                  selected={selectedTheme === "dark"}
                  onPress={() => onThemeSelect("dark")}
                />
                <ThemeOptionCard
                  title="Light Mode"
                  description="Clean white surface with dark purple highlights."
                  selected={selectedTheme === "light"}
                  onPress={() => onThemeSelect("light")}
                />
              </View>
            </>
          )}
        </View>

        <View className="gap-3 pt-6">
          {step > 0 ? (
            <AppButton
              label="Back"
              variant="secondary"
              onPress={() => setStep((currentStep) => currentStep - 1)}
            />
          ) : null}
          <AppButton
            label={isLastStep ? "Finish Onboarding" : "Continue"}
            variant="primary"
            onPress={handlePrimaryAction}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
