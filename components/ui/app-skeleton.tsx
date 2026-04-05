import { useColorScheme } from "nativewind";
import React from "react";
import { Path, Svg } from "react-native-svg";
import {
  Animated,
  Easing,
  LayoutChangeEvent,
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

export function AppSkeletonBlock({
  width = "100%",
  height = 12,
  borderRadius = 10,
  className,
  style,
}: AppSkeletonBlockProps) {
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const shimmerProgress = React.useRef(new Animated.Value(0)).current;
  const shimmerTranslateX = React.useMemo(
    () =>
      shimmerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [-220, 520],
      }),
    [shimmerProgress]
  );

  React.useEffect(() => {
    shimmerProgress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(shimmerProgress, {
        toValue: 1,
        duration: 1050,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();

    return () => {
      animation.stop();
      shimmerProgress.stopAnimation();
    };
  }, [shimmerProgress]);

  const blockColor = isDarkMode
    ? "rgba(255,255,255,0.16)"
    : "rgba(20,10,38,0.12)";
  const shimmerColor = isDarkMode
    ? "rgba(255,255,255,0.34)"
    : "rgba(255,255,255,0.92)";

  return (
    <View className={className} style={style}>
      <View
        style={{
          width,
          height,
          borderRadius,
          backgroundColor: blockColor,
          overflow: "hidden",
          opacity: isDarkMode ? 0.97 : 1,
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 140,
            backgroundColor: shimmerColor,
            opacity: isDarkMode ? 0.64 : 0.78,
            transform: [{ translateX: shimmerTranslateX }, { rotateZ: "14deg" }],
          }}
        />
      </View>
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
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const [plotSize, setPlotSize] = React.useState({ width: 0, height: 0 });
  const shimmerProgress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    shimmerProgress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(shimmerProgress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();

    return () => {
      animation.stop();
      shimmerProgress.stopAnimation();
    };
  }, [shimmerProgress]);

  const shimmerTranslateX = React.useMemo(
    () =>
      shimmerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [-220, 520],
      }),
    [shimmerProgress]
  );

  const handlePlotLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    const nextHeight = Math.round(event.nativeEvent.layout.height);

    setPlotSize((currentSize) => {
      if (
        currentSize.width === nextWidth &&
        currentSize.height === nextHeight
      ) {
        return currentSize;
      }

      return {
        width: nextWidth,
        height: nextHeight,
      };
    });
  }, []);

  const curveColor = isDarkMode
    ? "rgba(255,255,255,0.15)"
    : "rgba(20,10,38,0.11)";
  const areaFillColor = isDarkMode
    ? "rgba(255,255,255,0.04)"
    : "rgba(20,10,38,0.03)";
  const plotBackgroundColor = isDarkMode
    ? "rgba(255,255,255,0.055)"
    : "rgba(20,10,38,0.06)";
  const plotBorderColor = isDarkMode
    ? "rgba(255,255,255,0.12)"
    : "rgba(20,10,38,0.09)";
  const axisTickColor = isDarkMode
    ? "rgba(255,255,255,0.16)"
    : "rgba(20,10,38,0.1)";
  const shimmerColor = isDarkMode
    ? "rgba(255,255,255,0.2)"
    : "rgba(255,255,255,0.88)";

  const chartGeometry = React.useMemo(() => {
    if (plotSize.width <= 0 || plotSize.height <= 0) {
      return null;
    }

    const w = plotSize.width;
    const h = plotSize.height;
    const leftPadding = 12;
    const rightPadding = 58;
    const topPadding = 12;
    const bottomPadding = 28;
    const innerWidth = Math.max(w - leftPadding - rightPadding, 120);
    const innerHeight = Math.max(h - topPadding - bottomPadding, 92);

    const startX = leftPadding;
    const startY = topPadding + innerHeight * 0.88;

    const x1 = leftPadding + innerWidth * 0.17;
    const y1 = topPadding + innerHeight * 0.78;
    const x2 = leftPadding + innerWidth * 0.32;
    const y2 = topPadding + innerHeight * 0.66;
    const x3 = leftPadding + innerWidth * 0.48;
    const y3 = topPadding + innerHeight * 0.49;
    const x4 = leftPadding + innerWidth * 0.62;
    const y4 = topPadding + innerHeight * 0.55;
    const x5 = leftPadding + innerWidth * 0.8;
    const y5 = topPadding + innerHeight * 0.3;
    const x6 = leftPadding + innerWidth;
    const y6 = topPadding + innerHeight * 0.22;
    const floorY = topPadding + innerHeight + 4;

    const curvePath = [
      `M ${startX} ${startY}`,
      `C ${leftPadding + innerWidth * 0.08} ${topPadding + innerHeight * 0.84}, ${leftPadding + innerWidth * 0.12} ${topPadding + innerHeight * 0.8}, ${x1} ${y1}`,
      `S ${leftPadding + innerWidth * 0.26} ${topPadding + innerHeight * 0.71}, ${x2} ${y2}`,
      `S ${leftPadding + innerWidth * 0.4} ${topPadding + innerHeight * 0.58}, ${x3} ${y3}`,
      `S ${leftPadding + innerWidth * 0.56} ${topPadding + innerHeight * 0.49}, ${x4} ${y4}`,
      `S ${leftPadding + innerWidth * 0.72} ${topPadding + innerHeight * 0.34}, ${x5} ${y5}`,
      `S ${leftPadding + innerWidth * 0.92} ${topPadding + innerHeight * 0.24}, ${x6} ${y6}`,
    ].join(" ");

    return {
      curvePath,
      areaPath: `${curvePath} L ${x6} ${floorY} L ${startX} ${floorY} Z`,
    };
  }, [plotSize.height, plotSize.width]);

  return (
    <View
      className={[
        "rounded-2xl bg-brand-white/75 p-3 dark:bg-brand-white/5",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ height }}
    >
      <View
        onLayout={handlePlotLayout}
        className="flex-1 overflow-hidden rounded-xl px-3 py-3"
        style={{
          backgroundColor: plotBackgroundColor,
          borderWidth: 1,
          borderColor: plotBorderColor,
        }}
      >
        {chartGeometry ? (
          <Svg
            width={plotSize.width}
            height={plotSize.height}
            style={{ position: "absolute", left: 0, top: 0 }}
          >
            <Path
              d={chartGeometry.areaPath}
              fill={areaFillColor}
            />
            <Path
              d={chartGeometry.curvePath}
              stroke={curveColor}
              strokeWidth={2.2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}

        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -8,
            bottom: -8,
            width: 150,
            backgroundColor: shimmerColor,
            opacity: isDarkMode ? 0.18 : 0.36,
            transform: [{ translateX: shimmerTranslateX }, { rotateZ: "13deg" }],
          }}
        />

        <View className="absolute right-2 top-4 bottom-4 justify-between">
          <View
            style={{
              width: 34,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
          <View
            style={{
              width: 34,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
          <View
            style={{
              width: 34,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
          <View
            style={{
              width: 34,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
          <View
            style={{
              width: 34,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
        </View>

        <View className="absolute left-3 right-14 bottom-2 flex-row items-center justify-between">
          <View
            style={{
              width: 38,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
          <View
            style={{
              width: 38,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
          <View
            style={{
              width: 38,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
          <View
            style={{
              width: 38,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
          <View
            style={{
              width: 38,
              height: 8,
              borderRadius: 4,
              backgroundColor: axisTickColor,
            }}
          />
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
