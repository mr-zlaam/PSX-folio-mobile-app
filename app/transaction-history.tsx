import React from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { formatPKRAmount } from "@/src/features/home/home-formatters";
import {
  BonusShareRecord,
  getSavedBonusShareRecords,
} from "@/src/features/bonus-share/bonus-share-records";
import {
  DepositRecord,
  getSavedDepositRecords,
} from "@/src/features/deposit/deposit-records";
import {
  getSavedTradeOrders,
  TradeOrderRecord,
} from "@/src/features/trade/trade-orders";
import {
  DividendRecord,
  getSavedDividendRecords,
} from "@/src/features/dividend/dividend-records";
import { subscribeToTradeMutations } from "@/src/features/trade/trade-events";
import { APP_COLORS } from "@/src/theme/colors";

type TransactionEntryType = "buy" | "sell" | "dividend" | "deposit" | "bonus";

type TransactionEntry = {
  id: string;
  sourceId: string;
  type: TransactionEntryType;
  symbol: string;
  title: string;
  subtitle: string;
  amount: number;
  occurredAt: string;
};

type TransactionRangeFilter = "7D" | "30D" | "90D" | "ALL";

function getRangeDays(range: TransactionRangeFilter): number | null {
  if (range === "7D") {
    return 7;
  }

  if (range === "30D") {
    return 30;
  }

  if (range === "90D") {
    return 90;
  }

  return null;
}

function formatSignedPkrAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return "PKR 0";
  }

  const absValue = formatPKRAmount(Math.abs(value));
  if (value > 0) {
    return `+${absValue}`;
  }

  if (value < 0) {
    return `-${absValue}`;
  }

  return absValue;
}

function getAmountToneClassName(value: number): string {
  if (value > 0) {
    return "text-success-green";
  }

  if (value < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function getTypeBadgeClassName(type: TransactionEntryType): string {
  if (type === "buy") {
    return "bg-brand-red/15";
  }

  if (type === "sell") {
    return "bg-success-green/15";
  }

  if (type === "deposit") {
    return "bg-success-green/15";
  }

  if (type === "bonus") {
    return "bg-app-highlight/15 dark:bg-app-highlightDark/15";
  }

  return "bg-app-highlight/15 dark:bg-app-highlightDark/15";
}

function getTypeBadgeTextClassName(type: TransactionEntryType): string {
  if (type === "buy") {
    return "text-brand-red";
  }

  if (type === "sell") {
    return "text-success-green";
  }

  if (type === "deposit") {
    return "text-success-green";
  }

  if (type === "bonus") {
    return "text-app-highlight dark:text-app-highlightDark";
  }

  return "text-app-highlight dark:text-app-highlightDark";
}

function formatRecordDateTime(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toTradeEntry(order: TradeOrderRecord): TransactionEntry {
  const grossAmount = order.price * order.units;
  const signedAmount = order.side === "buy" ? -grossAmount : grossAmount;

  return {
    id: `trade_${order.id}`,
    sourceId: order.id,
    type: order.side,
    symbol: order.symbol.trim().toUpperCase(),
    title: order.side === "buy" ? "Buy Order" : "Sell Order",
    subtitle: `${Math.round(order.units)} shares @ ${formatPKRAmount(order.price)}`,
    amount: signedAmount,
    occurredAt: order.tradedAt || order.createdAt,
  };
}

function toDividendEntry(record: DividendRecord): TransactionEntry {
  return {
    id: `dividend_${record.id}`,
    sourceId: record.id,
    type: "dividend",
    symbol: record.symbol.trim().toUpperCase(),
    title: "Dividend",
    subtitle: `${Math.round(record.shares)} shares`,
    amount: record.finalAmount,
    occurredAt: record.dividendDate || record.createdAt,
  };
}

function toDepositEntry(record: DepositRecord): TransactionEntry {
  return {
    id: `deposit_${record.id}`,
    sourceId: record.id,
    type: "deposit",
    symbol: "CASH",
    title: "Deposit",
    subtitle: record.note ? record.note : "Portfolio funding",
    amount: record.amount,
    occurredAt: record.depositedAt || record.createdAt,
  };
}

function toBonusEntry(record: BonusShareRecord): TransactionEntry {
  return {
    id: `bonus_${record.id}`,
    sourceId: record.id,
    type: "bonus",
    symbol: record.symbol.trim().toUpperCase(),
    title: "Bonus Share",
    subtitle: `${Math.round(record.units)} shares`,
    amount: 0,
    occurredAt: record.awardedAt || record.createdAt,
  };
}

function sortEntriesByTimeDesc(entries: TransactionEntry[]): TransactionEntry[] {
  return [...entries].sort((firstEntry, secondEntry) => {
    const firstTimestamp = new Date(firstEntry.occurredAt).getTime();
    const secondTimestamp = new Date(secondEntry.occurredAt).getTime();

    if (Number.isFinite(firstTimestamp) && Number.isFinite(secondTimestamp)) {
      if (firstTimestamp !== secondTimestamp) {
        return secondTimestamp - firstTimestamp;
      }
    } else if (Number.isFinite(firstTimestamp)) {
      return -1;
    } else if (Number.isFinite(secondTimestamp)) {
      return 1;
    }

    return secondEntry.id.localeCompare(firstEntry.id);
  });
}

function canEditEntry(entry: TransactionEntry): boolean {
  return (
    entry.type === "buy" ||
    entry.type === "sell" ||
    entry.type === "deposit" ||
    entry.type === "dividend"
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: TransactionRangeFilter;
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

export default function TransactionHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const [entries, setEntries] = React.useState<TransactionEntry[]>([]);
  const [rangeFilter, setRangeFilter] = React.useState<TransactionRangeFilter>("7D");
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadTransactionHistory = React.useCallback(async () => {
    const [savedOrders, savedDividends, savedDeposits, savedBonuses] = await Promise.all([
      getSavedTradeOrders(),
      getSavedDividendRecords(),
      getSavedDepositRecords(),
      getSavedBonusShareRecords(),
    ]);

    const mappedEntries = [
      ...savedOrders.map(toTradeEntry),
      ...savedDividends.map(toDividendEntry),
      ...savedDeposits.map(toDepositEntry),
      ...savedBonuses.map(toBonusEntry),
    ];
    setEntries(sortEntriesByTimeDesc(mappedEntries));
  }, []);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadTransactionHistory();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadTransactionHistory]);

  React.useEffect(() => {
    void loadTransactionHistory();

    const unsubscribe = subscribeToTradeMutations(() => {
      void loadTransactionHistory();
    });

    return unsubscribe;
  }, [loadTransactionHistory]);

  const filteredEntries = React.useMemo(() => {
    const rangeDays = getRangeDays(rangeFilter);
    if (rangeDays === null) {
      return entries;
    }

    const thresholdTimestamp = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return entries.filter((entry) => {
      const occurredAtTimestamp = new Date(entry.occurredAt).getTime();
      if (!Number.isFinite(occurredAtTimestamp)) {
        return false;
      }

      return occurredAtTimestamp >= thresholdTimestamp;
    });
  }, [entries, rangeFilter]);

  const handleEditEntry = React.useCallback(
    (entry: TransactionEntry) => {
      if (entry.type === "buy" || entry.type === "sell") {
        router.push({
          pathname: "/(tabs)/transactions",
          params: {
            editTradeId: entry.sourceId,
          },
        });
        return;
      }

      if (entry.type === "deposit") {
        router.push({
          pathname: "/deposit",
          params: {
            editDepositId: entry.sourceId,
          },
        });
        return;
      }

      if (entry.type === "dividend") {
        router.push({
          pathname: "/dividend",
          params: {
            editDividendId: entry.sourceId,
          },
        });
      }
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
          paddingBottom: insets.bottom + 24,
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
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.back()}
              className="rounded-xl border border-app-highlight px-3 py-2 dark:border-app-highlightDark"
            >
              <Text className="text-sm font-semibold text-app-highlight dark:text-app-highlightDark">
                Back
              </Text>
            </TouchableOpacity>

            <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Transactions
            </Text>

            <View className="w-14" />
          </View>

          <View className="rounded-2xl bg-brand-white/95 p-3 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
            <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
              Range Filter
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <FilterChip
                label="7D"
                selected={rangeFilter === "7D"}
                onPress={() => setRangeFilter("7D")}
              />
              <FilterChip
                label="30D"
                selected={rangeFilter === "30D"}
                onPress={() => setRangeFilter("30D")}
              />
              <FilterChip
                label="90D"
                selected={rangeFilter === "90D"}
                onPress={() => setRangeFilter("90D")}
              />
              <FilterChip
                label="ALL"
                selected={rangeFilter === "ALL"}
                onPress={() => setRangeFilter("ALL")}
              />
            </View>
          </View>

          {filteredEntries.length === 0 ? (
            <View className="rounded-3xl bg-brand-white/95 p-4 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
                No transactions in this range
              </Text>
              <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                Try a wider filter like `30D`, `90D`, or `ALL`.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {filteredEntries.map((entry) => (
                <View
                  key={entry.id}
                  className="rounded-2xl bg-brand-white/95 px-4 py-3 shadow-sm dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-lg font-extrabold text-app-text dark:text-app-textDark">
                        {entry.symbol}
                      </Text>
                      <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
                        {entry.title}
                      </Text>
                      <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                        {entry.subtitle}
                      </Text>
                    </View>

                    <View className="items-end">
                      <View className={["rounded-lg px-2 py-1", getTypeBadgeClassName(entry.type)].join(" ")}>
                        <Text
                          className={[
                            "text-[10px] font-bold uppercase tracking-wide",
                            getTypeBadgeTextClassName(entry.type),
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {entry.type}
                        </Text>
                      </View>
                      <Text
                        className={[
                          "mt-2 text-sm font-extrabold",
                          getAmountToneClassName(entry.amount),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {formatSignedPkrAmount(entry.amount)}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                      {formatRecordDateTime(entry.occurredAt)}
                    </Text>
                    {canEditEntry(entry) ? (
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => handleEditEntry(entry)}
                        className="rounded-lg border border-app-highlight px-2 py-1 dark:border-app-highlightDark"
                      >
                        <Text className="text-[10px] font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                          Edit
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
