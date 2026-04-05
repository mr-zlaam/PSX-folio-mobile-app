import * as ReactNative from "react-native";
import RippleTouchableOpacity from "@/components/ui/ripple-touchable-opacity";

type MutableReactNativeModule = {
  TouchableOpacity?: unknown;
};

declare global {
  var __PSX_TOUCHABLE_RIPPLE_PATCHED__: boolean | undefined;
}

if (!globalThis.__PSX_TOUCHABLE_RIPPLE_PATCHED__) {
  const reactNativeModule = ReactNative as unknown as MutableReactNativeModule;

  try {
    Object.defineProperty(reactNativeModule, "TouchableOpacity", {
      configurable: true,
      writable: true,
      value: RippleTouchableOpacity,
    });
  } catch {
    reactNativeModule.TouchableOpacity = RippleTouchableOpacity;
  }

  globalThis.__PSX_TOUCHABLE_RIPPLE_PATCHED__ = true;
}
