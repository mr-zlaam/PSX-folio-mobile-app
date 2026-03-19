import React from "react";
import { GestureResponderEvent, LayoutChangeEvent, Text, View } from "react-native";
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

function buildPolylinePoints(
  points: StockLineChartPoint[],
  width: number,
  height: number
): string {
  if (points.length <= 1 || width <= 0 || height <= 0) {
    return "";
  }

  const prices = points.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;
  const safeRange = range === 0 ? 1 : range;

  return points
    .map((point, index) => {
      const x =
        points.length === 1 ? 0 : (index / (points.length - 1)) * clampToFinite(width);
      const normalizedY = (point.price - minPrice) / safeRange;
      const y = height - normalizedY * height;
      return `${x.toFixed(2)},${clampToFinite(y).toFixed(2)}`;
    })
    .join(" ");
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
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const chartWidth = React.useMemo(
    () => Math.max(width - CHART_HORIZONTAL_PADDING * 2, 0),
    [width]
  );

  const polylinePoints = React.useMemo(
    () => buildPolylinePoints(points, chartWidth, height),
    [chartWidth, height, points]
  );

  const selectedPoint = React.useMemo(() => {
    if (
      selectedIndex === null ||
      selectedIndex < 0 ||
      selectedIndex >= points.length
    ) {
      return null;
    }

    const point = points[selectedIndex];
    const x =
      points.length <= 1
        ? 0
        : (selectedIndex / (points.length - 1)) * chartWidth;
    const prices = points.map((item) => item.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice;
    const safeRange = range === 0 ? 1 : range;
    const normalizedY = (point.price - minPrice) / safeRange;
    const y = height - normalizedY * height;

    return {
      point,
      x,
      y,
    };
  }, [chartWidth, height, points, selectedIndex]);

  const handleSelectAtLocation = React.useCallback(
    (event: GestureResponderEvent) => {
      if (points.length < 2 || chartWidth <= 0) {
        setSelectedIndex(null);
        return;
      }

      const tappedX = event.nativeEvent.locationX - CHART_HORIZONTAL_PADDING;
      const clampedX = clamp(tappedX, 0, chartWidth);
      const index = Math.round((clampedX / chartWidth) * (points.length - 1));
      setSelectedIndex(index);
    },
    [chartWidth, points.length]
  );

  React.useEffect(() => {
    if (points.length === 0) {
      setSelectedIndex(null);
      return;
    }

    if (selectedIndex !== null && selectedIndex >= points.length) {
      setSelectedIndex(points.length - 1);
    }
  }, [points, selectedIndex]);

  React.useEffect(() => {
    if (!onPointSelected) {
      return;
    }

    onPointSelected(selectedPoint?.point ?? null);
  }, [onPointSelected, selectedPoint]);

  return (
    <View className="w-full" onLayout={handleLayout}>
      {points.length < 2 || chartWidth <= 0 || polylinePoints.length === 0 ? (
        <View className="h-[170px] items-center justify-center rounded-2xl bg-brand-white/70 dark:bg-brand-white/5">
          <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
            {emptyLabel}
          </Text>
        </View>
      ) : (
        <View className="rounded-2xl bg-brand-white/70 p-3 dark:bg-brand-white/5">
          <Svg width={chartWidth} height={height} onPress={handleSelectAtLocation}>
            <Line
              x1="0"
              y1={String(height)}
              x2={String(chartWidth)}
              y2={String(height)}
              stroke={gridColor}
              strokeWidth="1"
            />
            <Line
              x1="0"
              y1={String(height * 0.5)}
              x2={String(chartWidth)}
              y2={String(height * 0.5)}
              stroke={gridColor}
              strokeWidth="1"
            />
            <Line
              x1="0"
              y1="0"
              x2={String(chartWidth)}
              y2="0"
              stroke={gridColor}
              strokeWidth="1"
            />
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
                <Circle
                  cx={String(selectedPoint.x)}
                  cy={String(selectedPoint.y)}
                  r="4"
                  fill={lineColor}
                />
              </>
            ) : null}
          </Svg>
        </View>
      )}
    </View>
  );
}
