import React from "react";
import {
  Animated,
  Easing,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  getCachedKse100Summary,
  getHomeSnapshot,
  getInsightDisplayValue,
  InsightDisplayMode,
  getLatestKse100Summary,
  getLatestKse100SummaryMock,
  Kse100Summary,
} from "@/src/features/home/home-data";
import { formatKse100Points } from "@/src/features/home/home-formatters";
import { buildHomeViewModel } from "@/src/features/home/home-view-model";
import { ValueTone } from "@/src/features/home/types";

const KSE100_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function getToneClassName(tone: ValueTone): string {
  if (tone === "positive") {
    return "text-success-green";
  }

  if (tone === "negative") {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function getInsightValueClassName(valueText: string): string {
  const normalizedValue = valueText.trim();

  if (normalizedValue.startsWith("+")) {
    return "text-success-green";
  }

  if (normalizedValue.startsWith("-")) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

type HeaderActionButtonProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

function HeaderActionButton({ label, selected, onPress }: HeaderActionButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className={[
        "rounded-xl border px-3 py-1.5",
        selected
          ? "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
          : "border-app-highlight bg-button-neutral dark:border-app-highlightDark dark:bg-transparent",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-xs font-bold",
          selected
            ? "text-brand-white dark:text-brand-purple"
            : "text-app-highlight dark:text-app-highlightDark",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const initialKse100Summary = React.useMemo(
    () => getLatestKse100SummaryMock(),
    []
  );
  const animatedPoints = React.useRef(
    new Animated.Value(initialKse100Summary.points)
  ).current;
  const viewModel = React.useMemo(() => {
    const snapshot = getHomeSnapshot();
    return buildHomeViewModel(snapshot);
  }, []);
  const kse100SummaryRef = React.useRef<Kse100Summary>(initialKse100Summary);
  const [displayedKse100Points, setDisplayedKse100Points] = React.useState<number>(
    initialKse100Summary.points
  );
  const [insightMode, setInsightMode] = React.useState<InsightDisplayMode>("percentage");

  const handleTradePress = React.useCallback(() => {
    router.push("/(tabs)/transactions");
  }, [router]);

  const animateKse100Points = React.useCallback(
    (toValue: number) => {
      Animated.timing(animatedPoints, {
        toValue,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [animatedPoints]
  );

  const applyKse100Summary = React.useCallback(
    (nextSummary: Kse100Summary) => {
      const currentSummary = kse100SummaryRef.current;
      const didPointsChange = currentSummary.points !== nextSummary.points;

      if (!didPointsChange) {
        return;
      }

      kse100SummaryRef.current = nextSummary;

      animateKse100Points(nextSummary.points);
    },
    [animateKse100Points]
  );

  React.useEffect(() => {
    const listenerId = animatedPoints.addListener(({ value }) => {
      setDisplayedKse100Points(value);
    });

    return () => {
      animatedPoints.removeListener(listenerId);
    };
  }, [animatedPoints]);

  React.useEffect(() => {
    let isMounted = true;

    async function refreshKse100Summary() {
      const cachedSummary = await getCachedKse100Summary();
      if (isMounted && cachedSummary) {
        applyKse100Summary(cachedSummary);
      }

      const latestSummary = await getLatestKse100Summary();
      if (!isMounted) {
        return;
      }

      applyKse100Summary(latestSummary);
    }

    void refreshKse100Summary();
    const intervalId = setInterval(() => {
      void refreshKse100Summary();
    }, KSE100_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [applyKse100Summary]);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 96,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-7">
          <View className="rounded-3xl bg-brand-white/95 px-4 py-4 shadow-sm dark:bg-brand-white/10">
            <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
              KSE-100
            </Text>
            <Text className="mt-2 text-4xl font-extrabold text-app-text dark:text-app-textDark">
              {formatKse100Points(displayedKse100Points)}
            </Text>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
            <View className="flex-row items-center justify-between gap-3">
              <View className="self-start rounded-xl bg-app-highlight px-3 py-2 dark:bg-app-highlightDark">
                <Text className="text-xs font-bold uppercase tracking-wider text-brand-white dark:text-brand-purple">
                  Portfolio Summary
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <HeaderActionButton
                  label="Trade"
                  selected={true}
                  onPress={handleTradePress}
                />
              </View>
            </View>

            <View className="mt-4 gap-3">
              {viewModel.summaryItems.map((item) => (
                <View key={item.key} className="rounded-2xl bg-brand-white/70 px-4 py-3 dark:bg-brand-white/5">
                  <View className="flex-row items-start justify-between">
                    <View className="mr-3 flex-1">
                      <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                        {item.label}
                      </Text>
                      <Text className="mt-1 text-xs text-app-text dark:text-app-textDark">
                        {item.hint}
                      </Text>
                    </View>

                    <Text
                      className={[
                        "text-base font-extrabold",
                        getToneClassName(item.tone),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {item.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:bg-brand-white/10">
            <View className="flex-row items-center justify-between gap-3">
              <View className="self-start rounded-xl bg-app-highlight px-3 py-2 dark:bg-app-highlightDark">
                <Text className="text-xs font-bold uppercase tracking-wider text-brand-white dark:text-brand-purple">
                  Quick Insights
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <HeaderActionButton
                  label="Percentage"
                  selected={insightMode === "percentage"}
                  onPress={() => setInsightMode("percentage")}
                />
                <HeaderActionButton
                  label="Price"
                  selected={insightMode === "price"}
                  onPress={() => setInsightMode("price")}
                />
              </View>
            </View>

            <View className="mt-4 gap-3">
              {viewModel.insights.map((insight) => {
                const displayValue = getInsightDisplayValue(
                  insight.symbol,
                  insightMode,
                  insight.valueText
                );

                return (
                  <View
                    key={insight.label}
                    className="flex-row items-center justify-between rounded-2xl bg-brand-white/70 px-4 py-3 dark:bg-brand-white/5"
                  >
                    <View className="mr-3 flex-1">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        {insight.label}
                      </Text>
                      <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                        {insight.symbol}
                      </Text>
                    </View>

                    <Text
                      className={[
                        "text-sm font-semibold",
                        getInsightValueClassName(displayValue),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {displayValue}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
