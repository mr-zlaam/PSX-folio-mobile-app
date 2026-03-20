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

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
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

    const clampedX = clamp(selectedX, 0, chartWidth);
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

  const handleSelectAtRelativeX = React.useCallback(
    (relativeX: number) => {
      if (chartCoordinates.length < 2 || chartWidth <= 0) {
        setSelectedX(null);
        return;
      }

      setSelectedX(clamp(relativeX, 0, chartWidth));
    },
    [chartCoordinates.length, chartWidth]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          handleSelectAtRelativeX(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          handleSelectAtRelativeX(event.nativeEvent.locationX);
        },
      }),
    [handleSelectAtRelativeX]
  );

  React.useEffect(() => {
    if (chartCoordinates.length < 2) {
      setSelectedX(null);
      return;
    }

    if (selectedX !== null) {
      setSelectedX((previousValue) => {
        if (previousValue === null) {
          return previousValue;
        }

        return clamp(previousValue, 0, chartWidth);
      });
    }
  }, [chartCoordinates.length, chartWidth, selectedX]);

  React.useEffect(() => {
    if (!onPointSelected) {
      return;
    }

    onPointSelected(selectedPoint?.point ?? null);
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
