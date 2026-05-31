import React from "react";
import { LayoutChangeEvent, PanResponder, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Polyline } from "react-native-svg";

export type StockLineChartPoint = {
  timestamp: number;
  price: number;
};

type StockLineChartProps = {
  points: StockLineChartPoint[];
  secondaryPoints?: StockLineChartPoint[];
  lineColor: string;
  secondaryLineColor?: string;
  gridColor: string;
  emptyLabel?: string;
  height?: number;
  interactive?: boolean;
  curved?: boolean;
  showVerticalGuide?: boolean;
  showHorizontalGuide?: boolean;
  showSelectedSecondaryMarker?: boolean;
  onPointSelected?: (point: StockLineChartPoint | null) => void;
};

const CHART_HORIZONTAL_PADDING = 12;
const CHART_VERTICAL_PADDING = 8;

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
  minPrice: number,
  maxPrice: number
): ChartCoordinate[] {
  if (points.length === 0 || width <= 0 || height <= 0) {
    return [];
  }

  const range = maxPrice - minPrice;
  const safeRange = range === 0 ? 1 : range;
  const plotHeight = Math.max(height - CHART_VERTICAL_PADDING * 2, 1);

  return points.map((point, index) => {
    const x =
      points.length === 1 ? 0 : (index / (points.length - 1)) * clampToFinite(width);
    const normalizedY = (point.price - minPrice) / safeRange;
    const y = CHART_VERTICAL_PADDING + (1 - normalizedY) * plotHeight;
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

function buildCurvedPath(
  coordinates: ChartCoordinate[],
  tension = 0.85
): string {
  if (coordinates.length === 0) {
    return "";
  }

  if (coordinates.length === 1) {
    const point = coordinates[0]!;
    return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }

  if (coordinates.length === 2) {
    const first = coordinates[0]!;
    const second = coordinates[1]!;
    return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} L ${second.x.toFixed(
      2
    )} ${second.y.toFixed(2)}`;
  }

  let path = `M ${coordinates[0]!.x.toFixed(2)} ${coordinates[0]!.y.toFixed(2)}`;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const point0 = coordinates[index - 1] ?? coordinates[index]!;
    const point1 = coordinates[index]!;
    const point2 = coordinates[index + 1]!;
    const point3 = coordinates[index + 2] ?? point2;

    const controlPoint1X = point1.x + ((point2.x - point0.x) * tension) / 6;
    const controlPoint1Y = point1.y + ((point2.y - point0.y) * tension) / 6;
    const controlPoint2X = point2.x - ((point3.x - point1.x) * tension) / 6;
    const controlPoint2Y = point2.y - ((point3.y - point1.y) * tension) / 6;

    path += ` C ${controlPoint1X.toFixed(2)} ${controlPoint1Y.toFixed(
      2
    )}, ${controlPoint2X.toFixed(2)} ${controlPoint2Y.toFixed(
      2
    )}, ${point2.x.toFixed(2)} ${point2.y.toFixed(2)}`;
  }

  return path;
}

function findSelectedPointAtX(
  chartCoordinates: ChartCoordinate[],
  clampedX: number
): { point: StockLineChartPoint; x: number; y: number } | null {
  if (chartCoordinates.length === 0) {
    return null;
  }

  if (chartCoordinates.length === 1) {
    const coordinate = chartCoordinates[0];
    return {
      point: coordinate.point,
      x: clampedX,
      y: coordinate.y,
    };
  }

  let rightIndex = chartCoordinates.findIndex((coordinate) => coordinate.x >= clampedX);
  if (rightIndex === -1) {
    rightIndex = chartCoordinates.length - 1;
  }

  const leftIndex = Math.max(0, rightIndex - 1);
  const left = chartCoordinates[leftIndex];
  const right = chartCoordinates[rightIndex];
  const segmentWidth = right.x - left.x;
  const ratio = segmentWidth <= 0 ? 0 : clamp((clampedX - left.x) / segmentWidth, 0, 1);
  const interpolatedY = left.y + (right.y - left.y) * ratio;
  const nearest =
    Math.abs(clampedX - left.x) <= Math.abs(clampedX - right.x) ? left : right;

  return {
    point: nearest.point,
    x: clampedX,
    y: interpolatedY,
  };
}

export default function StockLineChart({
  points,
  secondaryPoints = [],
  lineColor,
  secondaryLineColor,
  gridColor,
  emptyLabel = "No chart data available",
  height = 170,
  interactive = true,
  curved = false,
  showVerticalGuide = true,
  showHorizontalGuide = true,
  showSelectedSecondaryMarker = false,
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

  const chartValueDomain = React.useMemo(() => {
    const allPrices = [...points, ...secondaryPoints]
      .map((point) => point.price)
      .filter((price) => Number.isFinite(price));

    if (allPrices.length === 0) {
      return { minPrice: 0, maxPrice: 1 };
    }

    return {
      minPrice: Math.min(...allPrices),
      maxPrice: Math.max(...allPrices),
    };
  }, [points, secondaryPoints]);

  const chartCoordinates = React.useMemo(
    () =>
      buildChartCoordinates(
        points,
        chartWidth,
        height,
        chartValueDomain.minPrice,
        chartValueDomain.maxPrice
      ),
    [chartValueDomain.maxPrice, chartValueDomain.minPrice, chartWidth, height, points]
  );

  const secondaryChartCoordinates = React.useMemo(
    () =>
      buildChartCoordinates(
        secondaryPoints,
        chartWidth,
        height,
        chartValueDomain.minPrice,
        chartValueDomain.maxPrice
      ),
    [
      chartValueDomain.maxPrice,
      chartValueDomain.minPrice,
      chartWidth,
      height,
      secondaryPoints,
    ]
  );

  const polylinePoints = React.useMemo(
    () =>
      chartCoordinates
        .map((coordinate) => `${coordinate.x.toFixed(2)},${coordinate.y.toFixed(2)}`)
        .join(" "),
    [chartCoordinates]
  );

  const secondaryPolylinePoints = React.useMemo(
    () =>
      secondaryChartCoordinates
        .map((coordinate) => `${coordinate.x.toFixed(2)},${coordinate.y.toFixed(2)}`)
        .join(" "),
    [secondaryChartCoordinates]
  );

  const curvedPrimaryPath = React.useMemo(
    () => buildCurvedPath(chartCoordinates),
    [chartCoordinates]
  );

  const curvedSecondaryPath = React.useMemo(
    () => buildCurvedPath(secondaryChartCoordinates),
    [secondaryChartCoordinates]
  );

  const selectedPoint = React.useMemo(() => {
    if (selectedX === null || chartCoordinates.length === 0) {
      return null;
    }

    const clampedX = clampToFinite(clamp(selectedX, 0, chartWidth));
    return findSelectedPointAtX(chartCoordinates, clampedX);
  }, [chartCoordinates, chartWidth, selectedX]);

  const selectedSecondaryPoint = React.useMemo(() => {
    if (selectedX === null || secondaryChartCoordinates.length === 0) {
      return null;
    }

    const clampedX = clampToFinite(clamp(selectedX, 0, chartWidth));
    return findSelectedPointAtX(secondaryChartCoordinates, clampedX);
  }, [chartWidth, secondaryChartCoordinates, selectedX]);

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
    if (!interactive) {
      setSelectedXIfChanged(null);
      return;
    }

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
  }, [chartCoordinates.length, chartWidth, interactive, setSelectedXIfChanged]);

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

  const hasEnoughPoints = points.length >= 2;

  return (
    <View className="w-full" onLayout={handleLayout}>
      {!hasEnoughPoints || chartWidth <= 0 || polylinePoints.length === 0 ? (
        <View
          style={{ height }}
          className="items-center justify-center rounded-2xl bg-text-light/5 dark:bg-brand-white/5"
        >
          {hasEnoughPoints && chartWidth <= 0 ? null : (
            <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
              {emptyLabel}
            </Text>
          )}
        </View>
      ) : (
        <View className="rounded-2xl bg-text-light/5 p-3 dark:bg-brand-white/5">
          <View
            style={{ width: chartWidth, height }}
            className="relative"
          >
            <Svg width={chartWidth} height={height}>
              {secondaryPolylinePoints.length > 0 && secondaryLineColor ? (
                curved ? (
                  <Path
                    d={curvedSecondaryPath}
                    fill="none"
                    stroke={secondaryLineColor}
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeOpacity="0.95"
                  />
                ) : (
                  <Polyline
                    points={secondaryPolylinePoints}
                    fill="none"
                    stroke={secondaryLineColor}
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeOpacity="0.95"
                  />
                )
              ) : null}
              {curved ? (
                <Path
                  d={curvedPrimaryPath}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : (
                <Polyline
                  points={polylinePoints}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {interactive && selectedPoint ? (
                <>
                  {showVerticalGuide ? (
                    <Line
                      x1={String(selectedPoint.x)}
                      y1="0"
                      x2={String(selectedPoint.x)}
                      y2={String(height)}
                      stroke={gridColor}
                      strokeWidth="1"
                    />
                  ) : null}
                  {showHorizontalGuide ? (
                    <Line
                      x1="0"
                      y1={String(selectedPoint.y)}
                      x2={String(chartWidth)}
                      y2={String(selectedPoint.y)}
                      stroke={gridColor}
                      strokeWidth="1"
                    />
                  ) : null}
                  <Circle
                    cx={String(selectedPoint.x)}
                    cy={String(selectedPoint.y)}
                    r="4"
                    fill={lineColor}
                  />
                  {showSelectedSecondaryMarker &&
                  selectedSecondaryPoint &&
                  secondaryLineColor ? (
                    <Circle
                      cx={String(selectedSecondaryPoint.x)}
                      cy={String(selectedSecondaryPoint.y)}
                      r="4"
                      fill={secondaryLineColor}
                    />
                  ) : null}
                </>
              ) : null}
            </Svg>

            {interactive ? (
              <View
                {...panResponder.panHandlers}
                className="absolute inset-0"
              />
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}
