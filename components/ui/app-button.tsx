import React from "react";
import {
  Animated,
  GestureResponderEvent,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from "react-native";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type AppButtonProps = Omit<TouchableOpacityProps, "onPress" | "style"> & {
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
    "bg-button-neutral border-brand-purple dark:bg-transparent dark:border-brand-white",
  danger: "bg-button-danger border-button-danger",
};

const textVariantClassMap: Record<ButtonVariant, string> = {
  primary: "text-brand-white dark:text-brand-purple",
  secondary: "text-brand-purple dark:text-brand-white",
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

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);

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
    <AnimatedTouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      activeOpacity={0.9}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className={[
        "items-center justify-center rounded-2xl border shadow-sm",
        "flex-row gap-2",
        fullWidth ? "w-full" : "self-start",
        sizeClassMap[size],
        variantClassMap[variant],
        isDisabled ? "opacity-60" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: [{ scale: scaleAnim }],
      }}
      {...rest}
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
    </AnimatedTouchableOpacity>
  );
}

export default AppButton;
