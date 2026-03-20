import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import ShariahChip from "@/components/ui/shariah-chip";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  getPortfolioHoldingsWithCachedQuotes,
  getPortfolioHoldingsWithLatestQuotes,
  PortfolioHolding,
} from "@/src/features/portfolio/portfolio-data";
import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import {
  getPortfolioDisplayModePreference,
  setPortfolioDisplayModePreference,
} from "@/src/lib/app-preferences";
import { APP_COLORS } from "@/src/theme/colors";

const SECTOR_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type PortfolioDisplayMode = "price" | "percentage";

function getValueToneClassName(value: number): string {
  if (value > 0) {
    return "text-success-green";
  }

  if (value < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function formatUnsignedPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  return `${Math.abs(value).toFixed(1)}%`;
}

function getHoldingSectorName(holding: PortfolioHolding): string {
  return holding.sectorName?.trim().length
    ? holding.sectorName.trim().toUpperCase()
    : "UNKNOWN";
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className={[
        "rounded-xl border px-3 py-2",
        selected
          ? "border-app-highlight bg-app-highlight dark:border-app-highlightDark dark:bg-app-highlightDark"
          : "border-app-highlight bg-button-neutral dark:border-app-highlightDark dark:bg-transparent",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-xs font-bold uppercase tracking-wide",
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

function SectorCompanyCard({
  holding,
  displayMode,
  portfolioTotalValue,
  isShariahCompliant,
  onPress,
}: {
  holding: PortfolioHolding;
  displayMode: PortfolioDisplayMode;
  portfolioTotalValue: number;
  isShariahCompliant: boolean;
  onPress: () => void;
}) {
  const sharePct =
    portfolioTotalValue === 0 ? 0 : (holding.marketValue / portfolioTotalValue) * 100;
  const headlineValue =
    displayMode === "price"
      ? formatPKRAmount(holding.marketValue)
      : formatUnsignedPercentage(sharePct);
  const pnlValue =
    displayMode === "price"
      ? formatPKRAmount(holding.pnl)
      : formatSignedPercentage(holding.pnlPct);
  const pnlTone = displayMode === "price" ? holding.pnl : holding.pnlPct;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      className="rounded-2xl bg-brand-white/95 px-3 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10"
    >
      <View className="flex-row items-start justify-between">
        <View className="mr-2 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-xl font-extrabold text-app-text dark:text-app-textDark">
              {holding.symbol}
            </Text>
            {isShariahCompliant ? <ShariahChip compact /> : null}
          </View>
          <Text
            className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark"
            numberOfLines={1}
          >
            {holding.companyName}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-base font-extrabold text-app-text dark:text-app-textDark">
            {headlineValue}
          </Text>
          <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
            {displayMode === "price" ? "Market Value" : "Portfolio Share"}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
          Invested
        </Text>
        <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
          {formatPKRAmount(holding.invested)}
        </Text>
      </View>

      <View className="mt-1 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
          Profit / Loss
        </Text>
        <Text
          className={["text-sm font-extrabold", getValueToneClassName(pnlTone)]
            .filter(Boolean)
            .join(" ")}
        >
          {pnlValue}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PortfolioSectorScreen() {
  const router = useRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchParams = useLocalSearchParams<{
    sector?: string | string[];
    display?: string | string[];
  }>();
  const normalizedSectorName = React.useMemo(() => {
    const rawSectorName = Array.isArray(searchParams.sector)
      ? searchParams.sector[0]
      : searchParams.sector;
    return (rawSectorName ?? "").trim().toUpperCase();
  }, [searchParams.sector]);
  const requestedDisplayMode = React.useMemo<PortfolioDisplayMode | null>(() => {
    const rawDisplayMode = Array.isArray(searchParams.display)
      ? searchParams.display[0]
      : searchParams.display;

    if (rawDisplayMode === "price" || rawDisplayMode === "percentage") {
      return rawDisplayMode;
    }

    return null;
  }, [searchParams.display]);

  const [displayMode, setDisplayMode] = React.useState<PortfolioDisplayMode>("percentage");
  const [hasHydratedDisplayMode, setHasHydratedDisplayMode] = React.useState(false);
  const [holdings, setHoldings] = React.useState<PortfolioHolding[]>([]);
  const [portfolioTotalValue, setPortfolioTotalValue] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    async function hydrateDisplayMode() {
      if (requestedDisplayMode) {
        setDisplayMode(requestedDisplayMode);
        setHasHydratedDisplayMode(true);
        return;
      }

      const savedDisplayMode = await getPortfolioDisplayModePreference();
      if (!isMounted) {
        return;
      }

      setDisplayMode(savedDisplayMode);
      setHasHydratedDisplayMode(true);
    }

    void hydrateDisplayMode();

    return () => {
      isMounted = false;
    };
  }, [requestedDisplayMode]);

  React.useEffect(() => {
    if (!hasHydratedDisplayMode) {
      return;
    }

    void setPortfolioDisplayModePreference(displayMode);
  }, [displayMode, hasHydratedDisplayMode]);

  const applySectorHoldings = React.useCallback(
    (allHoldings: PortfolioHolding[]) => {
      const nextPortfolioTotalValue = allHoldings.reduce(
        (sum, holding) => sum + holding.marketValue,
        0
      );
      const nextSectorHoldings = allHoldings
        .filter((holding) => getHoldingSectorName(holding) === normalizedSectorName)
        .sort((firstHolding, secondHolding) =>
          secondHolding.marketValue - firstHolding.marketValue
        );

      setPortfolioTotalValue(nextPortfolioTotalValue);
      setHoldings(nextSectorHoldings);
    },
    [normalizedSectorName]
  );

  const refreshSector = React.useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setIsInitialLoading(true);
      }

      try {
        if (normalizedSectorName.length === 0) {
          setPortfolioTotalValue(0);
          setHoldings([]);
          return;
        }

        const cachedHoldings = await getPortfolioHoldingsWithCachedQuotes();
        applySectorHoldings(cachedHoldings);

        const latestHoldings = await getPortfolioHoldingsWithLatestQuotes();
        applySectorHoldings(latestHoldings);
      } finally {
        if (showLoader) {
          setIsInitialLoading(false);
        }
      }
    },
    [applySectorHoldings, normalizedSectorName]
  );

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshSector();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshSector]);

  React.useEffect(() => {
    void refreshSector(true);
    const intervalId = setInterval(() => {
      void refreshSector();
    }, SECTOR_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshSector]);

  const handleOpenCompany = React.useCallback(
    (symbol: string) => {
      router.push({
        pathname: "/portfolio-position",
        params: {
          symbol: symbol.trim().toUpperCase(),
        },
      });
    },
    [router]
  );

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
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
            colors={[isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple]}
            progressBackgroundColor={
              isDarkMode ? APP_COLORS.brand.purple : APP_COLORS.brand.white
            }
          />
        }
      >
        <View className="gap-5">
          <View className="flex-row items-center justify-between">
            <AppBackIconButton onPress={() => router.back()} />

            <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Sector
            </Text>

            <View className="w-14" />
          </View>

          <View className="rounded-2xl bg-brand-white/95 p-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              {normalizedSectorName || "UNKNOWN"}
            </Text>
            <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
              Tap a company to open detail page.
            </Text>
            <View className="mt-3 flex-row gap-2">
              <FilterChip
                label="Percentage"
                selected={displayMode === "percentage"}
                onPress={() => setDisplayMode("percentage")}
              />
              <FilterChip
                label="Price"
                selected={displayMode === "price"}
                onPress={() => setDisplayMode("price")}
              />
            </View>
          </View>

          {isInitialLoading ? (
            <View className="items-center rounded-3xl bg-brand-white/95 p-6 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
              <ActivityIndicator
                size="small"
                color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
              />
              <Text className="mt-3 text-sm font-semibold text-app-text dark:text-app-textDark">
                Loading companies...
              </Text>
            </View>
          ) : holdings.length === 0 ? (
            <View className="rounded-2xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
              <Text className="text-base font-semibold text-app-text dark:text-app-textDark">
                No companies found in this sector.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {holdings.map((holding) => (
                <SectorCompanyCard
                  key={holding.symbol}
                  holding={holding}
                  displayMode={displayMode}
                  portfolioTotalValue={portfolioTotalValue}
                  isShariahCompliant={isShariahCompliantSymbol(holding.symbol)}
                  onPress={() => handleOpenCompany(holding.symbol)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
