import React from "react";
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  Text,
  View,
} from "react-native";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type AppButtonProps = Omit<PressableProps, "onPress" | "style" | "children"> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  textClassName?: string;
  onPress?: (event: GestureResponderEvent) => void;
};

const variantClassMap: Record<ButtonVariant, string> = {
  primary:
    "bg-button-primary border-button-primary dark:bg-button-neutral dark:border-button-neutral",
  secondary:
    "bg-app-highlight/8 border-app-highlight/10 dark:bg-brand-white/10 dark:border-brand-white/15",
  danger: "bg-button-danger border-button-danger",
};

const variantShadowClassMap: Record<ButtonVariant, string> = {
  primary: "shadow-sm shadow-app-highlight/30 dark:shadow-none",
  secondary: "shadow-none",
  danger: "shadow-none",
};

const textVariantClassMap: Record<ButtonVariant, string> = {
  primary: "text-brand-white dark:text-brand-purple",
  secondary: "text-app-highlight dark:text-app-highlightDark",
  danger: "text-brand-white",
};

const sizeClassMap: Record<ButtonSize, string> = {
  sm: "h-11 px-4",
  md: "h-12 px-5",
  lg: "h-14 px-6",
};

const textSizeClassMap: Record<ButtonSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

function AppButton({
  label,
  variant = "primary",
  size = "md",
  fullWidth = true,
  loading = false,
  disabled = false,
  leftSlot,
  rightSlot,
  className,
  textClassName,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = React.useCallback(
    (event: GestureResponderEvent) => {
      Animated.spring(scaleAnim, {
        toValue: 0.985,
        friction: 8,
        tension: 220,
        useNativeDriver: true,
      }).start();
      onPressIn?.(event);
    },
    [onPressIn, scaleAnim]
  );

  const handlePressOut = React.useCallback(
    (event: GestureResponderEvent) => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 180,
        useNativeDriver: true,
      }).start();
      onPressOut?.(event);
    },
    [onPressOut, scaleAnim]
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={{
        color: "rgba(0, 0, 0, 0.42)",
        borderless: false,
        foreground: true,
      }}
      className={[
        "rounded-2xl border overflow-hidden",
        fullWidth ? "w-full" : "self-start",
        sizeClassMap[size],
        variantClassMap[variant],
        variantShadowClassMap[variant],
        isDisabled ? "opacity-60" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={({ pressed }) =>
        pressed
          ? {
              backgroundColor: "rgba(0, 0, 0, 0.08)",
              opacity: 0.94,
            }
          : undefined
      }
      {...rest}
    >
      <Animated.View
        className="h-full w-full flex-row items-center justify-center gap-2"
        style={{
          transform: [{ scale: scaleAnim }],
        }}
      >
        {loading ? (
          <View className="items-center justify-center">
            <Text
              className={[
                "font-semibold tracking-wide",
                textSizeClassMap[size],
                textVariantClassMap[variant],
                textClassName ?? "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              Please wait...
            </Text>
          </View>
        ) : (
          <>
            {leftSlot ? <View className="items-center">{leftSlot}</View> : null}
            <Text
              className={[
                "font-semibold tracking-wide",
                textSizeClassMap[size],
                textVariantClassMap[variant],
                textClassName ?? "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {label}
            </Text>
            {rightSlot ? <View className="items-center">{rightSlot}</View> : null}
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

export default AppButton;
