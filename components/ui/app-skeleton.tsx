import { useColorScheme } from "nativewind";
import React from "react";
import {
  Animated,
  Easing,
  View,
  ViewStyle,
} from "react-native";

type AppSkeletonBlockProps = {
  width?: number | `${number}%` | "100%";
  height?: number;
  borderRadius?: number;
  className?: string;
  style?: ViewStyle;
};

const SHARED_PULSE_VALUE = new Animated.Value(0);
let isSharedPulseRunning = false;

function ensureSharedPulseAnimationStarted() {
  if (isSharedPulseRunning) {
    return;
  }

  isSharedPulseRunning = true;
  Animated.loop(
    Animated.sequence([
      Animated.timing(SHARED_PULSE_VALUE, {
        toValue: 1,
        duration: 900,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(SHARED_PULSE_VALUE, {
        toValue: 0,
        duration: 900,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ])
  ).start();
}

export function AppSkeletonBlock({
  width = "100%",
  height = 12,
  borderRadius = 10,
  className,
  style,
}: AppSkeletonBlockProps) {
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const animatedOpacity = React.useMemo(
    () =>
      SHARED_PULSE_VALUE.interpolate({
        inputRange: [0, 1],
        outputRange: [0.45, 0.95],
      }),
    []
  );

  React.useEffect(() => {
    ensureSharedPulseAnimationStarted();
  }, []);

  const blockColor = isDarkMode
    ? "rgba(255,255,255,0.16)"
    : "rgba(20,10,38,0.12)";

  return (
    <View className={className} style={style}>
      <Animated.View style={{ opacity: animatedOpacity }}>
        <View
          style={{
            width,
            height,
            borderRadius,
            backgroundColor: blockColor,
            opacity: isDarkMode ? 0.96 : 1,
          }}
        />
      </Animated.View>
    </View>
  );
}

type AppSkeletonTextGroupProps = {
  rows?: number;
  rowHeight?: number;
  gap?: number;
  className?: string;
};

export function AppSkeletonTextGroup({
  rows = 3,
  rowHeight = 12,
  gap = 8,
  className,
}: AppSkeletonTextGroupProps) {
  const items = Array.from({ length: rows });

  return (
    <View className={["gap-2", className ?? ""].filter(Boolean).join(" ")}>
      {items.map((_, index) => (
        <AppSkeletonBlock
          key={`skeleton-row-${index}`}
          height={rowHeight}
          width={index === rows - 1 ? "72%" : "100%"}
          style={{ marginBottom: index === rows - 1 ? 0 : gap - 8 }}
        />
      ))}
    </View>
  );
}

type AppChartSkeletonProps = {
  height?: number;
  className?: string;
};

export function AppChartSkeleton({
  height = 170,
  className,
}: AppChartSkeletonProps) {
  const miniBarHeights = [28, 42, 24, 54, 34, 46, 22, 38];

  return (
    <View
      className={[
        "rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ height }}
    >
      <View className="flex-row items-center justify-between">
        <AppSkeletonBlock height={10} width="44%" />
        <AppSkeletonBlock height={10} width={70} />
      </View>

      <View className="mt-3 flex-1 rounded-xl bg-app-highlight/5 p-3 dark:bg-brand-white/5">
        <View className="flex-1 justify-end">
          <View className="flex-row items-end justify-between gap-1">
            {miniBarHeights.map((barHeight, index) => (
              <AppSkeletonBlock
                key={`chart-skeleton-bar-${index}`}
                width={16}
                height={barHeight}
                borderRadius={6}
              />
            ))}
          </View>
        </View>

        <View className="mt-3 flex-row items-center justify-between">
          <AppSkeletonBlock width={54} height={8} borderRadius={5} />
          <AppSkeletonBlock width={54} height={8} borderRadius={5} />
          <AppSkeletonBlock width={54} height={8} borderRadius={5} />
          <AppSkeletonBlock width={54} height={8} borderRadius={5} />
        </View>
      </View>
    </View>
  );
}

type AppListCardSkeletonProps = {
  className?: string;
};

export function AppListCardSkeleton({ className }: AppListCardSkeletonProps) {
  return (
    <View
      className={[
        "rounded-2xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <AppSkeletonBlock width="38%" height={18} borderRadius={8} />
          <AppSkeletonBlock
            className="mt-2"
            width="76%"
            height={12}
            borderRadius={7}
          />
          <AppSkeletonBlock
            className="mt-2"
            width="48%"
            height={10}
            borderRadius={6}
          />
        </View>
        <View className="items-end">
          <AppSkeletonBlock width={92} height={18} borderRadius={8} />
          <AppSkeletonBlock
            className="mt-2"
            width={78}
            height={12}
            borderRadius={7}
          />
        </View>
      </View>

      <View className="mt-4 flex-row gap-3">
        <View className="flex-1">
          <AppSkeletonBlock width="38%" height={10} borderRadius={6} />
          <AppSkeletonBlock
            className="mt-2"
            width="64%"
            height={12}
            borderRadius={7}
          />
        </View>
        <View className="flex-1">
          <AppSkeletonBlock width="36%" height={10} borderRadius={6} />
          <AppSkeletonBlock
            className="mt-2"
            width="62%"
            height={12}
            borderRadius={7}
          />
        </View>
      </View>
    </View>
  );
}

type AppListScreenSkeletonProps = {
  cardCount?: number;
  className?: string;
  includeSearchBar?: boolean;
};

export function AppListScreenSkeleton({
  cardCount = 3,
  className,
  includeSearchBar = false,
}: AppListScreenSkeletonProps) {
  const cards = Array.from({ length: cardCount });

  return (
    <View className={["gap-3", className ?? ""].filter(Boolean).join(" ")}>
      {includeSearchBar ? (
        <View className="rounded-2xl bg-brand-white/90 p-4 dark:bg-brand-white/10">
          <AppSkeletonBlock width="46%" height={16} borderRadius={8} />
          <AppSkeletonBlock
            className="mt-3"
            width="100%"
            height={40}
            borderRadius={14}
          />
        </View>
      ) : null}

      {cards.map((_, index) => (
        <AppListCardSkeleton key={`list-screen-skeleton-${index}`} />
      ))}
    </View>
  );
}

type AppDetailScreenSkeletonProps = {
  className?: string;
};

export function AppDetailScreenSkeleton({ className }: AppDetailScreenSkeletonProps) {
  return (
    <View className={["gap-4", className ?? ""].filter(Boolean).join(" ")}>
      <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
        <AppSkeletonBlock width="26%" height={12} borderRadius={7} />
        <AppSkeletonBlock
          className="mt-2"
          width="72%"
          height={22}
          borderRadius={10}
        />
        <AppSkeletonBlock
          className="mt-2"
          width="44%"
          height={12}
          borderRadius={7}
        />
        <AppSkeletonBlock
          className="mt-4"
          width="48%"
          height={34}
          borderRadius={12}
        />
      </View>

      <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
        <AppChartSkeleton height={210} />
      </View>

      <AppListCardSkeleton />
    </View>
  );
}

export default AppSkeletonBlock;
