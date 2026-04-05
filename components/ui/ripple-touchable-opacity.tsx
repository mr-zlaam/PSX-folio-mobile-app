import React from "react";
import {
  Platform,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";

type RippleTouchableOpacityProps = Omit<PressableProps, "style"> & {
  activeOpacity?: number;
  style?:
    | StyleProp<ViewStyle>
    | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
};

const DEFAULT_ACTIVE_OPACITY = 0.72;
const DEFAULT_ANDROID_RIPPLE = {
  color: "rgba(0, 0, 0, 0.4)",
  borderless: false,
  foreground: true,
} as const;

const RippleTouchableOpacity = React.forwardRef<View, RippleTouchableOpacityProps>(
  (
    {
      activeOpacity = DEFAULT_ACTIVE_OPACITY,
      style,
      android_ripple,
      children,
      ...restProps
    },
    ref
  ) => {
    const handleStyle = React.useCallback(
      (state: PressableStateCallbackType): StyleProp<ViewStyle> => {
        const resolvedStyle =
          typeof style === "function" ? style(state) : style;

        return [
          resolvedStyle,
          state.pressed
            ? {
                opacity: activeOpacity,
                backgroundColor: Platform.OS === "android" ? "rgba(0, 0, 0, 0.08)" : undefined,
              }
            : null,
        ];
      },
      [activeOpacity, style]
    );

    return (
      <Pressable
        ref={ref}
        {...restProps}
        android_ripple={
          Platform.OS === "android"
            ? (android_ripple ?? DEFAULT_ANDROID_RIPPLE)
            : undefined
        }
        style={handleStyle}
      >
        {children}
      </Pressable>
    );
  }
);

RippleTouchableOpacity.displayName = "RippleTouchableOpacity";

export default RippleTouchableOpacity;
