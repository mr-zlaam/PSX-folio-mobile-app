import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BrokerFeeType,
  normalizeBrokerFeeType,
} from "@/src/lib/broker-fee";

type BrokerFeeCalculatorModalProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  defaultFeeType: BrokerFeeType;
  defaultFeeValueInput: string;
  onClose: () => void;
  onApply?: (payload: {
    feeType: BrokerFeeType;
    feeValue: number;
  }) => void;
};

const CALCULATOR_BUTTON_ROWS = [
  ["AC", "DEL", "(", ")"],
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "%", "+"],
  ["+/-", "="],
] as const;

function normalizeExpression(rawExpression: string): string {
  return rawExpression.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/");
}

function formatCalculatedNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  const rounded = Number(value.toFixed(8));
  return `${rounded}`.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function evaluateCalculatorExpression(rawExpression: string): number | null {
  const normalizedExpression = normalizeExpression(rawExpression);
  if (normalizedExpression.length === 0) {
    return null;
  }

  if (!/^[0-9+\-*/().%]+$/.test(normalizedExpression)) {
    return null;
  }

  const percentageResolvedExpression = normalizedExpression.replace(
    /(\d+(\.\d+)?)%/g,
    "($1/100)"
  );

  try {
    // Input is constrained to digits/operators/parentheses only.
    const evaluated = Function(
      `"use strict"; return (${percentageResolvedExpression});`
    )() as unknown;
    if (typeof evaluated !== "number" || !Number.isFinite(evaluated)) {
      return null;
    }
    return evaluated;
  } catch {
    return null;
  }
}

function CalculatorButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const isPrimary = label === "=";
  const isDanger = label === "AC";

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className={[
        "h-10 flex-1 items-center justify-center rounded-xl",
        isPrimary
          ? "bg-app-highlight dark:bg-app-highlightDark"
          : isDanger
            ? "bg-brand-red/15 dark:bg-brand-red/30"
            : "bg-brand-white/70 dark:bg-brand-white/5",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-sm font-bold",
          isPrimary
            ? "text-brand-white dark:text-brand-purple"
            : isDanger
              ? "text-brand-red"
              : "text-app-text dark:text-app-textDark",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function BrokerFeeCalculatorModal({
  visible,
  title = "Calculate Broker Fee",
  subtitle = "Use calculator and tap Add Fee.",
  defaultFeeType,
  defaultFeeValueInput,
  onClose,
  onApply,
}: BrokerFeeCalculatorModalProps) {
  const insets = useSafeAreaInsets();

  const [expressionInput, setExpressionInput] = React.useState(defaultFeeValueInput);
  const [hasEvaluationError, setHasEvaluationError] = React.useState(false);
  const feeType = React.useMemo(
    () => normalizeBrokerFeeType(defaultFeeType),
    [defaultFeeType],
  );

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    setExpressionInput(defaultFeeValueInput);
    setHasEvaluationError(false);
  }, [
    defaultFeeValueInput,
    visible,
  ]);

  const evaluatedExpressionValue = evaluateCalculatorExpression(expressionInput);
  const feeValue =
    evaluatedExpressionValue !== null && evaluatedExpressionValue >= 0
      ? evaluatedExpressionValue
      : null;
  const canApply = Boolean(onApply) && feeValue !== null;

  const appendToken = React.useCallback((token: string) => {
    setExpressionInput((currentValue) => {
      const nextValue = `${currentValue}${token}`;
      return nextValue.length <= 64 ? nextValue : currentValue;
    });
    setHasEvaluationError(false);
  }, []);

  const handleCalculatorPress = React.useCallback(
    (label: string) => {
      if (label === "AC") {
        setExpressionInput("");
        setHasEvaluationError(false);
        return;
      }

      if (label === "DEL") {
        setExpressionInput((currentValue) =>
          currentValue.length > 0 ? currentValue.slice(0, -1) : currentValue
        );
        setHasEvaluationError(false);
        return;
      }

      if (label === "+/-") {
        setExpressionInput((currentValue) => {
          const trimmed = currentValue.trim();
          if (trimmed.length === 0) {
            return "-";
          }

          return trimmed.startsWith("-") ? trimmed.slice(1) : `-${trimmed}`;
        });
        setHasEvaluationError(false);
        return;
      }

      if (label === "=") {
        const evaluatedValue = evaluateCalculatorExpression(expressionInput);
        if (evaluatedValue === null) {
          setHasEvaluationError(true);
          return;
        }

        setExpressionInput(formatCalculatedNumber(evaluatedValue));
        setHasEvaluationError(false);
        return;
      }

      appendToken(label);
    },
    [appendToken, expressionInput]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 justify-center bg-brand-purple/70 px-5">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <View className="rounded-3xl border border-app-highlight/20 bg-app-bg p-5 shadow-md shadow-app-highlight/30 dark:border-app-highlightDark/20 dark:bg-app-bgDark">
            <Text className="text-base font-extrabold text-app-text dark:text-app-textDark">
              {title}
            </Text>
            <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
              {subtitle}
            </Text>

            <View className="mt-4 gap-3">
              <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Expression
                </Text>
                <Text
                  className="mt-1 text-base font-bold text-app-text dark:text-app-textDark"
                  numberOfLines={2}
                >
                  {expressionInput.length > 0 ? expressionInput : "0"}
                </Text>
                <Text className="mt-2 text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Value
                </Text>
                <Text className="mt-1 text-sm font-bold text-app-highlight dark:text-app-highlightDark">
                  {feeValue === null ? "--" : formatCalculatedNumber(feeValue)}
                  {feeType === "percentage" ? "%" : " PKR"}
                </Text>
                <Text className="mt-2 text-[11px] font-semibold text-app-text dark:text-app-textDark">
                  Applied as {feeType === "percentage" ? "percentage" : "fixed PKR"} fee.
                </Text>
                {hasEvaluationError ? (
                  <Text className="mt-1 text-xs font-semibold text-brand-red">
                    Invalid expression. Please correct it.
                  </Text>
                ) : null}
              </View>

              <View className="gap-2">
                {CALCULATOR_BUTTON_ROWS.map((row, rowIndex) => (
                  <View key={`${rowIndex}`} className="flex-row gap-2">
                    {row.map((label) => (
                      <CalculatorButton
                        key={label}
                        label={label}
                        onPress={() => handleCalculatorPress(label)}
                      />
                    ))}
                    {row.length === 2 ? <View className="flex-1" /> : null}
                    {row.length === 2 ? <View className="flex-1" /> : null}
                  </View>
                ))}
              </View>

            </View>

            <View className="mt-5 flex-row items-center gap-3">
              <View className="flex-1">
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={onClose}
                  className="rounded-xl bg-app-highlight/8 px-3 py-2 dark:bg-brand-white/10"
                >
                  <Text className="text-center text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
              {onApply ? (
                <View className="flex-1">
                  <TouchableOpacity
                    activeOpacity={0.88}
                    disabled={!canApply}
                    onPress={() => {
                      if (!canApply || !onApply || feeValue === null) {
                        return;
                      }

                      onApply({
                        feeType,
                        feeValue,
                      });
                    }}
                    className={[
                      "rounded-xl bg-app-highlight px-3 py-2 dark:bg-app-highlightDark",
                      canApply ? "" : "opacity-60",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Text className="text-center text-sm font-semibold text-brand-white dark:text-brand-purple">
                      Add Fee
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
