import React from "react";
import { useGuardedRouter } from "@/src/lib/navigation";
import {
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppButton from "@/components/ui/app-button";
import AppFeedbackModal from "@/components/ui/app-feedback-modal";
import { AppSkeletonBlock } from "@/components/ui/app-skeleton";
import { formatPKRAmount } from "@/src/features/home/home-formatters";
import {
  BonusShareRecord,
  deleteBonusShareRecord,
  getSavedBonusShareRecords,
} from "@/src/features/bonus-share/bonus-share-records";
import {
  deleteDepositRecord,
  DepositRecord,
  getSavedDepositRecords,
} from "@/src/features/deposit/deposit-records";
import {
  deleteTradeOrder,
  getSavedTradeOrders,
  TradeOrderRecord,
} from "@/src/features/trade/trade-orders";
import {
  deleteDividendRecord,
  DividendRecord,
  getSavedDividendRecords,
} from "@/src/features/dividend/dividend-records";
import { subscribeToTradeMutations } from "@/src/features/trade/trade-events";
import { calculateBrokerFeeAmount } from "@/src/lib/broker-fee";
import { APP_COLORS } from "@/src/theme/colors";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type TransactionEntryType = "buy" | "sell" | "dividend" | "deposit" | "bonus";

type TransactionEntry = {
  id: string;
  sourceId: string;
  type: TransactionEntryType;
  symbol: string;
  title: string;
  subtitle: string;
  amount: number;
  brokerDeductionAmount: number;
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
  const brokerDeductionAmount = calculateBrokerFeeAmount({
    price: order.price,
    units: order.units,
    brokerFeeType: order.brokerFeeType,
    brokerFeeValue: order.brokerFeeValue,
    brokerFeePct:
      typeof order.brokerFeePct === "number" ? order.brokerFeePct : null,
  });

  return {
    id: `trade_${order.id}`,
    sourceId: order.id,
    type: order.side,
    symbol: order.symbol.trim().toUpperCase(),
    title: order.side === "buy" ? "Buy Order" : "Sell Order",
    subtitle: `${Math.round(order.units)} shares @ ${formatPKRAmount(order.price)}`,
    amount: signedAmount,
    brokerDeductionAmount,
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
    brokerDeductionAmount: 0,
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
    brokerDeductionAmount: 0,
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
    brokerDeductionAmount: 0,
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

function canDeleteEntry(entry: TransactionEntry): boolean {
  return (
    entry.type === "buy" ||
    entry.type === "sell" ||
    entry.type === "deposit" ||
    entry.type === "dividend" ||
    entry.type === "bonus"
  );
}

function getEntryDeleteCopy(entry: TransactionEntry): {
  title: string;
  message: string;
} {
  if (entry.type === "buy" || entry.type === "sell") {
    return {
      title: "Delete Trade Transaction",
      message:
        "This trade will be removed and portfolio values will be recalculated immediately.",
    };
  }

  if (entry.type === "deposit") {
    return {
      title: "Delete Deposit Transaction",
      message:
        "This deposit will be removed and free cash/portfolio values will be recalculated immediately.",
    };
  }

  if (entry.type === "dividend") {
    return {
      title: "Delete Dividend Transaction",
      message:
        "This dividend will be removed and all related totals will be recalculated immediately.",
    };
  }

  return {
    title: "Delete Bonus Share Transaction",
    message:
      "This bonus share entry will be removed and holdings/portfolio values will be recalculated immediately.",
  };
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
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const [entries, setEntries] = React.useState<TransactionEntry[]>([]);
  const [rangeFilter, setRangeFilter] = React.useState<TransactionRangeFilter>("7D");
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [deletingEntryId, setDeletingEntryId] = React.useState<string | null>(null);
  const [pendingDeleteEntry, setPendingDeleteEntry] =
    React.useState<TransactionEntry | null>(null);
  const [notice, setNotice] = React.useState<{
    title: string;
    message: string;
    tone: "success" | "error" | "info";
  } | null>(null);
  const addTransactionSheetRef = React.useRef<BottomSheetModal>(null);
  const addTransactionSheetSnapPoints = React.useMemo(() => ["32%"], []);

  const addTransactionSheetBackdrop = React.useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  const closeAddTransactionSheet = React.useCallback(() => {
    addTransactionSheetRef.current?.dismiss();
  }, []);

  const openAddTransactionSheet = React.useCallback(() => {
    addTransactionSheetRef.current?.present();
  }, []);

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

  const handleOpenTradeForm = React.useCallback(() => {
    router.push({
      pathname: "/(tabs)/transactions",
      params: {
        lockSymbol: "0",
      },
    });
  }, [router]);

  const handleOpenDividend = React.useCallback(() => {
    closeAddTransactionSheet();
    router.push("/dividend");
  }, [closeAddTransactionSheet, router]);

  const handleOpenBonusShare = React.useCallback(() => {
    closeAddTransactionSheet();
    router.push("/bonus-share");
  }, [closeAddTransactionSheet, router]);

  const deleteEntryAndRefresh = React.useCallback(
    async (entry: TransactionEntry) => {
      if (deletingEntryId !== null) {
        return;
      }

      setDeletingEntryId(entry.id);
      try {
        if (entry.type === "buy" || entry.type === "sell") {
          await deleteTradeOrder(entry.sourceId);
        } else if (entry.type === "deposit") {
          await deleteDepositRecord(entry.sourceId);
        } else if (entry.type === "dividend") {
          await deleteDividendRecord(entry.sourceId);
        } else {
          await deleteBonusShareRecord(entry.sourceId);
        }

        await loadTransactionHistory();
        setNotice({
          title: "Transaction Deleted",
          message:
            "The transaction was removed and your portfolio has been recalculated.",
          tone: "success",
        });
      } catch {
        setNotice({
          title: "Delete Failed",
          message: "Could not delete this transaction. Please try again.",
          tone: "error",
        });
      } finally {
        setDeletingEntryId(null);
      }
    },
    [deletingEntryId, loadTransactionHistory]
  );

  const handleDeleteEntry = React.useCallback(
    (entry: TransactionEntry) => {
      if (deletingEntryId !== null) {
        return;
      }

      setPendingDeleteEntry(entry);
    },
    [deletingEntryId]
  );

  const handleCancelDelete = React.useCallback(() => {
    if (deletingEntryId !== null) {
      return;
    }
    setPendingDeleteEntry(null);
  }, [deletingEntryId]);

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteEntry) {
      return;
    }

    void deleteEntryAndRefresh(pendingDeleteEntry).finally(() => {
      setPendingDeleteEntry(null);
    });
  }, [deleteEntryAndRefresh, pendingDeleteEntry]);

  const deleteCopy = React.useMemo(() => {
    if (!pendingDeleteEntry) {
      return null;
    }
    return getEntryDeleteCopy(pendingDeleteEntry);
  }, [pendingDeleteEntry]);

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
            <AppBackIconButton onPress={() => router.back()} />

            <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Transactions
            </Text>

            <View className="w-14" />
          </View>

          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <AppButton
                label="Trade"
                variant="danger"
                size="sm"
                onPress={handleOpenTradeForm}
              />
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={openAddTransactionSheet}
              className="h-11 w-11 items-center justify-center rounded-xl bg-app-highlight dark:bg-app-highlightDark"
            >
              <MaterialCommunityIcons
                name="plus"
                size={22}
                color={isDarkMode ? APP_COLORS.brand.purple : APP_COLORS.brand.white}
              />
            </TouchableOpacity>
          </View>

          <View className="rounded-2xl bg-brand-white/95 p-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
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
            <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
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
                  className="rounded-2xl bg-brand-white/95 px-4 py-3 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
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
                      {entry.type === "buy" || entry.type === "sell" ? (
                        <Text className="mt-1 text-[11px] font-semibold text-brand-red">
                          Broker Deduction: -{formatPKRAmount(entry.brokerDeductionAmount)}
                        </Text>
                      ) : null}
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
                    <View className="flex-row items-center gap-2">
                      {canEditEntry(entry) ? (
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => handleEditEntry(entry)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${entry.type} transaction`}
                          className="rounded-lg bg-app-highlight/10 px-2.5 py-1.5 dark:bg-brand-white/10"
                        >
                          <MaterialCommunityIcons
                            name="pencil-outline"
                            size={16}
                            color={
                              isDarkMode
                                ? APP_COLORS.brand.white
                                : APP_COLORS.brand.purple
                            }
                          />
                        </TouchableOpacity>
                      ) : null}
                      {canDeleteEntry(entry) ? (
                        <TouchableOpacity
                          activeOpacity={0.88}
                          disabled={deletingEntryId === entry.id}
                          onPress={() => handleDeleteEntry(entry)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${entry.type} transaction`}
                          className="rounded-lg bg-brand-red/15 px-2.5 py-1.5"
                        >
                          {deletingEntryId === entry.id ? (
                            <AppSkeletonBlock
                              width={14}
                              height={14}
                              borderRadius={7}
                              className="bg-brand-red/35"
                            />
                          ) : (
                            <MaterialCommunityIcons
                              name="trash-can-outline"
                              size={16}
                              color={APP_COLORS.brand.red}
                            />
                          )}
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <BottomSheetModal
        ref={addTransactionSheetRef}
        snapPoints={addTransactionSheetSnapPoints}
        enablePanDownToClose
        backdropComponent={addTransactionSheetBackdrop}
        backgroundStyle={{
          backgroundColor: isDarkMode
            ? APP_COLORS.brand.purple
            : APP_COLORS.brand.white,
        }}
        handleIndicatorStyle={{
          backgroundColor: isDarkMode
            ? APP_COLORS.brand.white
            : APP_COLORS.brand.purple,
        }}
      >
        <BottomSheetView
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <Text className="text-center text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
            Add Transaction
          </Text>

          <View className="mt-4 gap-3">
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleOpenDividend}
              className="rounded-xl bg-brand-white/90 px-4 py-3 shadow-sm shadow-app-highlight/20 dark:bg-brand-white/10 dark:shadow-none dark:border dark:border-app-highlightDark/12"
            >
              <Text className="text-base font-bold text-app-text dark:text-app-textDark">
                Add Dividend
              </Text>
              <Text className="mt-0.5 text-xs font-semibold text-app-text dark:text-app-textDark">
                Record dividend payout for a symbol.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleOpenBonusShare}
              className="rounded-xl bg-brand-white/90 px-4 py-3 shadow-sm shadow-app-highlight/20 dark:bg-brand-white/10 dark:shadow-none dark:border dark:border-app-highlightDark/12"
            >
              <Text className="text-base font-bold text-app-text dark:text-app-textDark">
                Add Bonus Share
              </Text>
              <Text className="mt-0.5 text-xs font-semibold text-app-text dark:text-app-textDark">
                Add bonus shares to holdings.
              </Text>
            </TouchableOpacity>
          </View>

        </BottomSheetView>
      </BottomSheetModal>

      <Modal
        visible={pendingDeleteEntry !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleCancelDelete}
      >
        <View className="flex-1 items-center justify-center bg-brand-purple/70 px-6">
          <View className="w-full max-w-md rounded-3xl border border-app-highlight/20 bg-app-bg p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border-app-highlightDark/20 dark:bg-app-bgDark">
            <Text className="text-xs font-bold uppercase tracking-wide text-brand-red">
              Confirm Delete
            </Text>

            <Text className="mt-3 text-lg font-extrabold text-app-text dark:text-app-textDark">
              {deleteCopy?.title ?? "Delete Transaction"}
            </Text>
            <Text className="mt-2 text-sm font-semibold leading-6 text-app-text dark:text-app-textDark">
              {deleteCopy?.message ??
                "This action will remove the transaction and recalculate portfolio values."}
            </Text>

            <View className="mt-5 flex-row items-center gap-3">
              <View className="flex-1">
                <AppButton
                  label="Cancel"
                  size="sm"
                  variant="secondary"
                  disabled={deletingEntryId !== null}
                  onPress={handleCancelDelete}
                />
              </View>
              <View className="flex-1">
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={deletingEntryId !== null}
                  onPress={handleConfirmDelete}
                  className={[
                    "rounded-xl bg-brand-red px-3 py-2",
                    deletingEntryId !== null ? "opacity-70" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {deletingEntryId !== null ? (
                    <View className="items-center justify-center">
                      <AppSkeletonBlock
                        width={56}
                        height={10}
                        borderRadius={6}
                        className="bg-brand-white/40"
                      />
                    </View>
                  ) : (
                    <Text className="text-center text-sm font-semibold text-brand-white">
                      Delete
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <AppFeedbackModal
        visible={notice !== null}
        title={notice?.title ?? ""}
        message={notice?.message ?? ""}
        tone={notice?.tone ?? "info"}
        actionLabel="Done"
        onClose={() => setNotice(null)}
      />
    </SafeAreaView>
  );
}
