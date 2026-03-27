import React from "react";
import { LayoutChangeEvent, PanResponder, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

export type StockLineChartPoint = {
  timestamp: number;
  price: number;
};

type StockLineChartProps = {
  points: StockLineChartPoint[];
  lineColor: string;
  gridColor: string;
  emptyLabel?: string;
  height?: number;
  onPointSelected?: (point: StockLineChartPoint | null) => void;
};

const CHART_HORIZONTAL_PADDING = 12;

function clampToFinite(value: number, fallbackValue = 0): number {
  if (!Number.isFinite(value)) {
    return fallbackValue;
  }

  return value;
}

type ChartCoordinate = {
  index: number;
  x: number;
  y: number;
  point: StockLineChartPoint;
};

function buildChartCoordinates(
  points: StockLineChartPoint[],
  width: number,
  height: number,
): ChartCoordinate[] {
  if (points.length === 0 || width <= 0 || height <= 0) {
    return [];
  }

  const prices = points.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;
  const safeRange = range === 0 ? 1 : range;

  return points.map((point, index) => {
    const x =
      points.length === 1 ? 0 : (index / (points.length - 1)) * clampToFinite(width);
    const normalizedY = (point.price - minPrice) / safeRange;
    const y = height - normalizedY * height;
    return {
      index,
      x: clampToFinite(x),
      y: clampToFinite(y),
      point,
    };
  });
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(minValue, value));
}

export default function StockLineChart({
  points,
  lineColor,
  gridColor,
  emptyLabel = "No chart data available",
  height = 170,
  onPointSelected,
}: StockLineChartProps) {
  const [width, setWidth] = React.useState(0);
  const [selectedX, setSelectedX] = React.useState<number | null>(null);
  const lastSelectedXRef = React.useRef<number | null>(null);
  const pendingRelativeXRef = React.useRef<number | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const lastEmittedSelectionRef = React.useRef<{
    point: StockLineChartPoint | null;
    callback: StockLineChartProps["onPointSelected"];
  }>({
    point: null,
    callback: undefined,
  });

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setWidth((previousWidth) =>
      previousWidth === nextWidth ? previousWidth : nextWidth
    );
  }, []);

  const chartWidth = React.useMemo(
    () => Math.max(width - CHART_HORIZONTAL_PADDING * 2, 0),
    [width]
  );

  const chartCoordinates = React.useMemo(
    () => buildChartCoordinates(points, chartWidth, height),
    [chartWidth, height, points]
  );

  const polylinePoints = React.useMemo(
    () =>
      chartCoordinates
        .map((coordinate) => `${coordinate.x.toFixed(2)},${coordinate.y.toFixed(2)}`)
        .join(" "),
    [chartCoordinates]
  );

  const selectedPoint = React.useMemo(() => {
    if (selectedX === null || chartCoordinates.length === 0) {
      return null;
    }

    const clampedX = clampToFinite(clamp(selectedX, 0, chartWidth));
    if (chartCoordinates.length === 1) {
      const coordinate = chartCoordinates[0];
      return {
        point: coordinate.point,
        x: clampedX,
        y: coordinate.y,
      };
    }

    let rightIndex = chartCoordinates.findIndex(
      (coordinate) => coordinate.x >= clampedX
    );

    if (rightIndex === -1) {
      rightIndex = chartCoordinates.length - 1;
    }

    const leftIndex = Math.max(0, rightIndex - 1);
    const left = chartCoordinates[leftIndex];
    const right = chartCoordinates[rightIndex];
    const segmentWidth = right.x - left.x;
    const ratio =
      segmentWidth <= 0 ? 0 : clamp((clampedX - left.x) / segmentWidth, 0, 1);
    const interpolatedY = left.y + (right.y - left.y) * ratio;
    const nearest =
      Math.abs(clampedX - left.x) <= Math.abs(clampedX - right.x) ? left : right;

    return {
      point: nearest.point,
      x: clampedX,
      y: interpolatedY,
    };
  }, [chartCoordinates, chartWidth, selectedX]);

  const setSelectedXIfChanged = React.useCallback(
    (nextX: number | null) => {
      setSelectedX((previousX) => {
        if (nextX === null) {
          if (previousX === null) {
            return previousX;
          }

          lastSelectedXRef.current = null;
          return null;
        }

        if (!Number.isFinite(nextX) || chartWidth <= 0) {
          return previousX;
        }

        const normalizedX = clamp(nextX, 0, chartWidth);
        const lastSelectedX = lastSelectedXRef.current;
        if (
          previousX !== null &&
          lastSelectedX !== null &&
          Math.abs(normalizedX - lastSelectedX) < 0.25
        ) {
          return previousX;
        }

        if (previousX !== null && Math.abs(normalizedX - previousX) < 0.25) {
          return previousX;
        }

        lastSelectedXRef.current = normalizedX;
        return normalizedX;
      });
    },
    [chartWidth]
  );

  const flushPendingSelection = React.useCallback(() => {
    const relativeX = pendingRelativeXRef.current;
    if (
      relativeX === null ||
      chartCoordinates.length < 2 ||
      chartWidth <= 0 ||
      !Number.isFinite(relativeX)
    ) {
      setSelectedXIfChanged(null);
      return;
    }

    setSelectedXIfChanged(relativeX);
  }, [chartCoordinates.length, chartWidth, setSelectedXIfChanged]);

  const scheduleSelectionFromRelativeX = React.useCallback(
    (relativeX: number) => {
      pendingRelativeXRef.current = relativeX;
      if (animationFrameRef.current !== null) {
        return;
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = null;
        flushPendingSelection();
      });
    },
    [flushPendingSelection]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          scheduleSelectionFromRelativeX(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          scheduleSelectionFromRelativeX(event.nativeEvent.locationX);
        },
        onPanResponderRelease: (event) => {
          scheduleSelectionFromRelativeX(event.nativeEvent.locationX);
        },
        onPanResponderTerminate: (event) => {
          scheduleSelectionFromRelativeX(event.nativeEvent.locationX);
        },
      }),
    [scheduleSelectionFromRelativeX]
  );

  React.useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    []
  );

  React.useEffect(() => {
    if (chartCoordinates.length < 2 || chartWidth <= 0) {
      setSelectedXIfChanged(null);
      return;
    }

    setSelectedX((previousValue) => {
      if (previousValue === null) {
        return previousValue;
      }

      const normalizedX = clamp(previousValue, 0, chartWidth);
      if (normalizedX === previousValue) {
        return previousValue;
      }

      lastSelectedXRef.current = normalizedX;
      return normalizedX;
    });
  }, [chartCoordinates.length, chartWidth, setSelectedXIfChanged]);

  React.useEffect(() => {
    if (!onPointSelected) {
      return;
    }

    const nextPoint = selectedPoint?.point ?? null;
    const { point: previousPoint, callback: previousCallback } =
      lastEmittedSelectionRef.current;
    const isSamePoint =
      previousPoint === nextPoint ||
      (previousPoint !== null &&
        nextPoint !== null &&
        previousPoint.timestamp === nextPoint.timestamp &&
        previousPoint.price === nextPoint.price) ||
      (previousPoint === null && nextPoint === null);

    if (isSamePoint && previousCallback === onPointSelected) {
      return;
    }

    lastEmittedSelectionRef.current = {
      point: nextPoint,
      callback: onPointSelected,
    };
    onPointSelected(nextPoint);
  }, [onPointSelected, selectedPoint]);

  return (
    <View className="w-full" onLayout={handleLayout}>
      {points.length < 2 || chartWidth <= 0 || polylinePoints.length === 0 ? (
        <View
          style={{ height }}
          className="items-center justify-center rounded-2xl bg-text-light/5 dark:bg-brand-white/5"
        >
          <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
            {emptyLabel}
          </Text>
        </View>
      ) : (
        <View className="rounded-2xl bg-text-light/5 p-3 dark:bg-brand-white/5">
          <View
            style={{ width: chartWidth, height }}
            className="relative"
          >
            <Svg width={chartWidth} height={height}>
              <Polyline
                points={polylinePoints}
                fill="none"
                stroke={lineColor}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {selectedPoint ? (
                <>
                  <Line
                    x1={String(selectedPoint.x)}
                    y1="0"
                    x2={String(selectedPoint.x)}
                    y2={String(height)}
                    stroke={gridColor}
                    strokeWidth="1"
                  />
                  <Line
                    x1="0"
                    y1={String(selectedPoint.y)}
                    x2={String(chartWidth)}
                    y2={String(selectedPoint.y)}
                    stroke={gridColor}
                    strokeWidth="1"
                  />
                  <Circle
                    cx={String(selectedPoint.x)}
                    cy={String(selectedPoint.y)}
                    r="4"
                    fill={lineColor}
                  />
                </>
              ) : null}
            </Svg>

            <View
              {...panResponder.panHandlers}
              className="absolute inset-0"
            />
          </View>
        </View>
      )}
    </View>
  );
}
