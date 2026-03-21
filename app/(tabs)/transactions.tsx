import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import AppButton from "@/components/ui/app-button";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppFeedbackModal, {
  AppFeedbackModalTone,
} from "@/components/ui/app-feedback-modal";
import ShariahChip from "@/components/ui/shariah-chip";
import {
  getCachedSymbolQuote,
  getCachedSymbols,
  getLatestSymbolQuote,
  getLatestSymbols,
  getSymbolQuoteFallback,
  PsxSymbol,
  SymbolQuote,
} from "@/src/features/trade/trade-data";
import {
  formatPKRAmount,
  formatSignedPercentage,
} from "@/src/features/home/home-formatters";
import { useShariahSymbols } from "@/src/features/market/shariah-symbols";
import {
  BrokerSettings,
  getCashGuardEnabledPreference,
  getBrokerSettings,
  getTaxpayerProfilePreference,
  TaxpayerProfile,
} from "@/src/lib/app-preferences";
import { APP_COLORS } from "@/src/theme/colors";
import {
  getSavedBonusShareRecords,
} from "@/src/features/bonus-share/bonus-share-records";
import {
  InsufficientUnitsError,
  getTradeOrderById,
  getSavedTradeOrders,
  saveTradeOrder,
  updateTradeOrder,
} from "@/src/features/trade/trade-orders";
import { getCashLedgerSnapshot } from "@/src/features/trade/cash-ledger";
import { getPositionSnapshotForSymbol } from "@/src/features/portfolio/position-ledger";

const TRADE_QUOTE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type TradeSide = "buy" | "sell";
type BrokerMode = "saved" | "custom";
type TradeDateTimePickerMode = "date" | "time";
type TradeNoticeState = {
  title: string;
  message: string;
  tone: AppFeedbackModalTone;
};

const CGT_RATE_BY_PROFILE: Record<TaxpayerProfile, number> = {
  filer: 15,
  nonFiler: 30,
};

function getTaxpayerProfileLabel(profile: TaxpayerProfile): string {
  return profile === "filer" ? "Filer" : "Non-Filer";
}

function formatDateTimeInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatEditablePrice(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
}

function getChangeTextClassName(change: number): string {
  if (change > 0) {
    return "text-success-green";
  }

  if (change < 0) {
    return "text-brand-red";
  }

  return "text-app-text dark:text-app-textDark";
}

function getTradeSideActionText(side: TradeSide): "bought" | "sold" {
  return side === "buy" ? "bought" : "sold";
}

function ToggleChip({
  label,
  selected,
  selectedTone = "default",
  onPress,
}: {
  label: string;
  selected: boolean;
  selectedTone?: "default" | "danger";
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      className={[
        "rounded-xl px-3 py-2",
        selected
          ? selectedTone === "danger"
            ? "bg-brand-red dark:bg-brand-red"
            : "bg-app-highlight dark:bg-app-highlightDark"
          : "bg-brand-white/70 dark:bg-brand-white/5",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-xs font-bold uppercase tracking-wide",
          selected
            ? selectedTone === "danger"
              ? "text-brand-white"
              : "text-brand-white dark:text-brand-purple"
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

function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText?: (nextValue: string) => void;
  placeholder?: string;
  placeholderTextColor: string;
  keyboardType?: "default" | "numeric";
  editable?: boolean;
}) {
  return (
    <View className="flex-1">
      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        keyboardType={keyboardType}
        editable={editable}
        className="mt-1 rounded-xl bg-brand-white/70 px-3 py-2 text-sm font-semibold text-app-text dark:bg-brand-white/5 dark:text-app-textDark"
      />
    </View>
  );
}

export default function TransactionsTabScreen() {
  const router = useRouter();
  const { isShariahCompliantSymbol } = useShariahSymbols();
  const searchParams = useLocalSearchParams<{
    symbol?: string | string[];
    side?: string | string[];
    lockSymbol?: string | string[];
    editTradeId?: string | string[];
    originTab?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const [tradeSide, setTradeSide] = React.useState<TradeSide>("buy");
  const [brokerMode, setBrokerMode] = React.useState<BrokerMode>("saved");

  const [symbols, setSymbols] = React.useState<PsxSymbol[]>([]);
  const [symbolSearchQuery, setSymbolSearchQuery] = React.useState("");
  const [selectedSymbol, setSelectedSymbol] = React.useState("");
  const [symbolQuote, setSymbolQuote] = React.useState<SymbolQuote>(
    getSymbolQuoteFallback("")
  );

  const [priceInput, setPriceInput] = React.useState("");
  const [unitsInput, setUnitsInput] = React.useState("");
  const [tradeDateTime, setTradeDateTime] = React.useState(new Date());
  const [tradeDateTimePickerMode, setTradeDateTimePickerMode] =
    React.useState<TradeDateTimePickerMode>("date");
  const [isTradeDateTimePickerVisible, setIsTradeDateTimePickerVisible] =
    React.useState(false);
  const [isAwaitingTimeSelection, setIsAwaitingTimeSelection] =
    React.useState(false);
  const [customBrokerNameInput, setCustomBrokerNameInput] = React.useState("");
  const [customBrokerFeePctInput, setCustomBrokerFeePctInput] = React.useState("");
  const [savedBrokerSettings, setSavedBrokerSettings] =
    React.useState<BrokerSettings | null>(null);
  const [taxpayerProfile, setTaxpayerProfile] =
    React.useState<TaxpayerProfile>("nonFiler");
  const [cashGuardEnabled, setCashGuardEnabled] = React.useState(false);
  const [availableCash, setAvailableCash] = React.useState(0);
  const [deductCgtTaxOnSell, setDeductCgtTaxOnSell] = React.useState(true);
  const [hasEditedPrice, setHasEditedPrice] = React.useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [tradeNotice, setTradeNotice] = React.useState<TradeNoticeState | null>(null);
  const [shouldGoBackAfterNotice, setShouldGoBackAfterNotice] =
    React.useState(false);

  const normalizedRouteSymbol = React.useMemo(() => {
    const rawSymbol = Array.isArray(searchParams.symbol)
      ? searchParams.symbol[0]
      : searchParams.symbol;
    return (rawSymbol ?? "").trim().toUpperCase();
  }, [searchParams.symbol]);

  const requestedRouteSide = React.useMemo(() => {
    const rawSide = Array.isArray(searchParams.side)
      ? searchParams.side[0]
      : searchParams.side;
    if (rawSide === "buy" || rawSide === "sell") {
      return rawSide;
    }
    return null;
  }, [searchParams.side]);

  const isSymbolLocked = React.useMemo(() => {
    const rawLockSymbol = Array.isArray(searchParams.lockSymbol)
      ? searchParams.lockSymbol[0]
      : searchParams.lockSymbol;
    return rawLockSymbol === "1" || rawLockSymbol === "true";
  }, [searchParams.lockSymbol]);

  const normalizedEditTradeId = React.useMemo(() => {
    const rawEditTradeId = Array.isArray(searchParams.editTradeId)
      ? searchParams.editTradeId[0]
      : searchParams.editTradeId;
    return (rawEditTradeId ?? "").trim();
  }, [searchParams.editTradeId]);

  const routeOriginTab = React.useMemo(() => {
    const rawOriginTab = Array.isArray(searchParams.originTab)
      ? searchParams.originTab[0]
      : searchParams.originTab;
    if (rawOriginTab === "home" || rawOriginTab === "more") {
      return rawOriginTab;
    }
    return null;
  }, [searchParams.originTab]);

  const isEditingTrade = normalizedEditTradeId.length > 0;

  const filteredSymbols = React.useMemo(() => {
    const normalizedQuery = symbolSearchQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return [];
    }

    return symbols
      .filter((symbolItem) => {
        const symbolMatch = symbolItem.symbol.toLowerCase().includes(normalizedQuery);
        const nameMatch = symbolItem.name.toLowerCase().includes(normalizedQuery);
        return symbolMatch || nameMatch;
      })
      .slice(0, 8);
  }, [symbolSearchQuery, symbols]);

  const refreshSymbols = React.useCallback(async () => {
    const cachedSymbols = await getCachedSymbols();
    if (cachedSymbols.length > 0) {
      setSymbols(cachedSymbols);
    }

    const latestSymbols = await getLatestSymbols();
    if (latestSymbols.length > 0) {
      setSymbols(latestSymbols);
    }
  }, []);

  const refreshQuoteForSymbol = React.useCallback(async (symbol: string) => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      setSymbolQuote(getSymbolQuoteFallback(""));
      return;
    }

    const cachedQuote = await getCachedSymbolQuote(normalizedSymbol);
    if (cachedQuote) {
      setSymbolQuote(cachedQuote);
    }

    const latestQuote = await getLatestSymbolQuote(normalizedSymbol);
    setSymbolQuote(latestQuote);
  }, []);

  const refreshCashLedger = React.useCallback(async () => {
    const [isCashGuardEnabled, cashLedger] = await Promise.all([
      getCashGuardEnabledPreference(),
      getCashLedgerSnapshot({
        excludeTradeId: isEditingTrade ? normalizedEditTradeId : undefined,
      }),
    ]);
    setCashGuardEnabled(isCashGuardEnabled);
    setAvailableCash(cashLedger.availableCash);
  }, [isEditingTrade, normalizedEditTradeId]);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshSymbols();
      await refreshQuoteForSymbol(selectedSymbol);
      const savedTaxpayerProfile = await getTaxpayerProfilePreference();
      setTaxpayerProfile(savedTaxpayerProfile);
      await refreshCashLedger();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshCashLedger, refreshQuoteForSymbol, refreshSymbols, selectedSymbol]);

  React.useEffect(() => {
    if (isEditingTrade || normalizedRouteSymbol.length === 0) {
      return;
    }

    setSelectedSymbol(normalizedRouteSymbol);
    setSymbolSearchQuery(normalizedRouteSymbol);
  }, [isEditingTrade, normalizedRouteSymbol]);

  React.useEffect(() => {
    if (isEditingTrade || !requestedRouteSide) {
      return;
    }

    setTradeSide(requestedRouteSide);
  }, [isEditingTrade, requestedRouteSide]);

  React.useEffect(() => {
    void refreshSymbols();
  }, [refreshSymbols]);

  React.useEffect(() => {
    void refreshCashLedger();
  }, [refreshCashLedger]);

  const loadSavedBrokerSettings = React.useCallback(async () => {
    const brokerSettings = await getBrokerSettings();
    setSavedBrokerSettings(brokerSettings);
  }, []);

  const loadTaxpayerProfile = React.useCallback(async () => {
    const savedTaxpayerProfile = await getTaxpayerProfilePreference();
    setTaxpayerProfile(savedTaxpayerProfile);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadSavedBrokerSettings();
      void loadTaxpayerProfile();
      void refreshCashLedger();
    }, [loadSavedBrokerSettings, loadTaxpayerProfile, refreshCashLedger])
  );

  React.useEffect(() => {
    let isMounted = true;
    if (!isEditingTrade) {
      return () => {
        isMounted = false;
      };
    }

    async function loadTradeForEdit() {
      const existingTrade = await getTradeOrderById(normalizedEditTradeId);
      if (!isMounted) {
        return;
      }

      if (!existingTrade) {
        setTradeNotice({
          title: "Trade Not Found",
          message: "This trade record was not found. It may have been removed.",
          tone: "error",
        });
        return;
      }

      setTradeSide(existingTrade.side);
      setSelectedSymbol(existingTrade.symbol);
      setSymbolSearchQuery(existingTrade.symbol);
      setPriceInput(formatEditablePrice(existingTrade.price));
      setHasEditedPrice(true);
      setUnitsInput(String(Math.round(existingTrade.units)));

      const parsedTradeDate = new Date(existingTrade.tradedAt);
      setTradeDateTime(
        Number.isNaN(parsedTradeDate.getTime()) ? new Date() : parsedTradeDate
      );

      setBrokerMode(existingTrade.brokerMode);
      setCustomBrokerNameInput(existingTrade.brokerName ?? "");
      setCustomBrokerFeePctInput(
        typeof existingTrade.brokerFeePct === "number" &&
          Number.isFinite(existingTrade.brokerFeePct)
          ? String(existingTrade.brokerFeePct)
          : ""
      );
    }

    void loadTradeForEdit();
    return () => {
      isMounted = false;
    };
  }, [isEditingTrade, normalizedEditTradeId]);

  React.useEffect(() => {
    let isMounted = true;
    const normalizedSymbol = selectedSymbol.trim().toUpperCase();

    if (normalizedSymbol.length === 0) {
      setSymbolQuote(getSymbolQuoteFallback(""));
      if (!isEditingTrade) {
        setHasEditedPrice(false);
      }
      setPriceInput("");
      return () => {
        isMounted = false;
      };
    }

    async function refreshQuote() {
      const cachedQuote = await getCachedSymbolQuote(normalizedSymbol);
      if (isMounted && cachedQuote) {
        setSymbolQuote(cachedQuote);
      }

      const latestQuote = await getLatestSymbolQuote(normalizedSymbol);
      if (isMounted) {
        setSymbolQuote(latestQuote);
      }
    }

    setSymbolQuote(getSymbolQuoteFallback(normalizedSymbol));
    if (!isEditingTrade) {
      setHasEditedPrice(false);
    }

    void refreshQuote();
    const intervalId = setInterval(() => {
      void refreshQuote();
    }, TRADE_QUOTE_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [isEditingTrade, selectedSymbol]);

  React.useEffect(() => {
    if (!hasEditedPrice && symbolQuote.lastPrice > 0) {
      setPriceInput(formatEditablePrice(symbolQuote.lastPrice));
    }
  }, [hasEditedPrice, symbolQuote.lastPrice]);

  const handleSelectSymbol = React.useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setSymbolSearchQuery(symbol);
  }, []);

  const showTradeNotice = React.useCallback(
    (title: string, message: string, tone: AppFeedbackModalTone = "info") => {
      setTradeNotice({
        title,
        message,
        tone,
      });
    },
    []
  );

  const handleBackFromTrade = React.useCallback(() => {
    // For symbol-driven or edit flows, preserve stack back behavior.
    if (
      isEditingTrade ||
      normalizedRouteSymbol.length > 0 ||
      requestedRouteSide !== null ||
      isSymbolLocked
    ) {
      router.back();
      return;
    }

    if (routeOriginTab === "more") {
      router.replace("/(tabs)/more");
      return;
    }

    if (routeOriginTab === "home") {
      router.replace("/(tabs)/home");
      return;
    }

    router.back();
  }, [
    isEditingTrade,
    isSymbolLocked,
    normalizedRouteSymbol.length,
    requestedRouteSide,
    routeOriginTab,
    router,
  ]);

  const handleCloseTradeNotice = React.useCallback(() => {
    setTradeNotice(null);
    if (shouldGoBackAfterNotice) {
      setShouldGoBackAfterNotice(false);
      handleBackFromTrade();
    }
  }, [handleBackFromTrade, shouldGoBackAfterNotice]);

  const handleCreateOrder = React.useCallback(async () => {
    const normalizedSymbol = selectedSymbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      showTradeNotice(
        "Symbol Required",
        "Please select a symbol before creating order.",
        "error"
      );
      return;
    }

    const parsedPrice = Number(priceInput.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      showTradeNotice("Invalid Price", "Enter a valid price greater than 0.", "error");
      return;
    }

    const parsedUnits = Number(unitsInput.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedUnits) || parsedUnits <= 0) {
      showTradeNotice("Invalid Units", "Enter units greater than 0.", "error");
      return;
    }

    if (!Number.isInteger(parsedUnits)) {
      showTradeNotice("Invalid Units", "Units must be a whole number.", "error");
      return;
    }

    let brokerName: string | null = null;
    let brokerFeePct: number | null = null;

    if (brokerMode === "saved") {
      if (!savedBrokerSettings) {
        showTradeNotice(
          "Saved Broker Missing",
          "Please configure Broker Settings first, or switch to Custom mode.",
          "error"
        );
        return;
      }

      brokerName = savedBrokerSettings.brokerName;
      brokerFeePct = savedBrokerSettings.transactionFeePct;
    }

    if (brokerMode === "custom") {
      const normalizedBrokerName = customBrokerNameInput.trim();
      if (normalizedBrokerName.length === 0) {
        showTradeNotice("Broker Required", "Enter your custom broker name.", "error");
        return;
      }

      const parsedBrokerFeePct = Number(
        customBrokerFeePctInput.trim().replace(/,/g, "")
      );
      if (!Number.isFinite(parsedBrokerFeePct) || parsedBrokerFeePct < 0) {
        showTradeNotice(
          "Invalid Broker Fee",
          "Enter broker fee percentage (0 or above).",
          "error"
        );
        return;
      }

      brokerName = normalizedBrokerName;
      brokerFeePct = parsedBrokerFeePct;
    }

    if (cashGuardEnabled && tradeSide === "buy") {
      const grossBuyAmount = parsedPrice * parsedUnits;
      const feePct = brokerFeePct && brokerFeePct > 0 ? brokerFeePct : 0;
      const estimatedBrokerFee = (grossBuyAmount * feePct) / 100;
      const estimatedOrderCost = grossBuyAmount + estimatedBrokerFee;
      const cashLedger = await getCashLedgerSnapshot({
        excludeTradeId: isEditingTrade ? normalizedEditTradeId : undefined,
      });

      if (estimatedOrderCost > cashLedger.availableCash) {
        showTradeNotice(
          "Insufficient Cash",
          `Cash Guard is enabled.\nAvailable cash: ${formatPKRAmount(
            cashLedger.availableCash
          )}.\nRequired for this buy: ${formatPKRAmount(estimatedOrderCost)}.`,
          "error"
        );
        return;
      }
    }

    let sellGrossProfit = 0;
    let sellNetProfit = 0;
    let sellCgtRatePct = 0;
    let sellCgtTaxAmount = 0;
    let isCgtApplied = false;

    if (tradeSide === "sell") {
      const [savedOrders, bonusShareRecords] = await Promise.all([
        getSavedTradeOrders(),
        getSavedBonusShareRecords(),
      ]);
      const effectiveOrders = isEditingTrade
        ? savedOrders.filter((order) => order.id !== normalizedEditTradeId)
        : savedOrders;
      const positionSnapshot = getPositionSnapshotForSymbol(
        effectiveOrders,
        bonusShareRecords,
        normalizedSymbol
      );

      if (positionSnapshot.units <= 0) {
        showTradeNotice(
          "No Position Found",
          `You do not have an active holding for ${normalizedSymbol}.`,
          "error"
        );
        return;
      }

      if (parsedUnits > positionSnapshot.units) {
        showTradeNotice(
          "Units Exceed Holding",
          `You can sell up to ${positionSnapshot.units} shares for ${normalizedSymbol}.`,
          "error"
        );
        return;
      }

      sellGrossProfit = (parsedPrice - positionSnapshot.averageBuyPrice) * parsedUnits;
      sellNetProfit = sellGrossProfit;

      if (deductCgtTaxOnSell && sellGrossProfit > 0) {
        sellCgtRatePct = CGT_RATE_BY_PROFILE[taxpayerProfile];
        sellCgtTaxAmount = (sellGrossProfit * sellCgtRatePct) / 100;
        sellNetProfit = sellGrossProfit - sellCgtTaxAmount;
        isCgtApplied = true;
      }
    }

    setIsSubmittingOrder(true);
    setShouldGoBackAfterNotice(false);
    try {
      const savedOrder = isEditingTrade
        ? await updateTradeOrder(normalizedEditTradeId, {
            side: tradeSide,
            symbol: normalizedSymbol,
            price: parsedPrice,
            units: parsedUnits,
            tradedAt: tradeDateTime.toISOString(),
            brokerMode,
            brokerName,
            brokerFeePct,
            cashGuardApplied: cashGuardEnabled,
          })
        : await saveTradeOrder({
            side: tradeSide,
            symbol: normalizedSymbol,
            price: parsedPrice,
            units: parsedUnits,
            tradedAt: tradeDateTime.toISOString(),
            brokerMode,
            brokerName,
            brokerFeePct,
            cashGuardApplied: cashGuardEnabled,
          });

      if (tradeSide === "sell") {
        const messageLines = [
          `You have sold ${savedOrder.units} shares of ${savedOrder.symbol} at ${formatPKRAmount(savedOrder.price)} per share.`,
          `Estimated Gross P/L: ${formatPKRAmount(sellGrossProfit)}.`,
        ];

        if (deductCgtTaxOnSell) {
          if (isCgtApplied) {
            messageLines.push(
              `CGT (${getTaxpayerProfileLabel(taxpayerProfile)} ${sellCgtRatePct}%): ${formatPKRAmount(-sellCgtTaxAmount)}.`
            );
            messageLines.push(`Estimated Net P/L: ${formatPKRAmount(sellNetProfit)}.`);
          } else {
            messageLines.push("CGT not applied because this sell is not in profit.");
          }
        } else {
          messageLines.push("CGT deduction is turned off for this sell order.");
        }

        messageLines.push("Saved locally on this device.");
        showTradeNotice(
          isEditingTrade ? "Trade Updated" : "Sold Successfully",
          messageLines.join("\n"),
          "success"
        );
        await refreshCashLedger();

        if (isEditingTrade) {
          setShouldGoBackAfterNotice(true);
          return;
        }

        setUnitsInput("");
        setCustomBrokerNameInput("");
        setCustomBrokerFeePctInput("");
        setTradeDateTime(new Date());
        setHasEditedPrice(false);
        if (symbolQuote.lastPrice > 0) {
          setPriceInput(formatEditablePrice(symbolQuote.lastPrice));
        }
        return;
      }

      showTradeNotice(
        isEditingTrade ? "Trade Updated" : "Bought Successfully",
        `You have ${getTradeSideActionText(tradeSide)} ${
          savedOrder.units
        } shares of ${savedOrder.symbol} at ${formatPKRAmount(
          savedOrder.price
        )} per share.\nSaved locally on this device.`,
        "success"
      );
      await refreshCashLedger();

      if (isEditingTrade) {
        setShouldGoBackAfterNotice(true);
        return;
      }

      setUnitsInput("");
      setCustomBrokerNameInput("");
      setCustomBrokerFeePctInput("");
      setTradeDateTime(new Date());
      setHasEditedPrice(false);
      if (symbolQuote.lastPrice > 0) {
        setPriceInput(formatEditablePrice(symbolQuote.lastPrice));
      }
    } catch (error) {
      if (error instanceof InsufficientUnitsError) {
        showTradeNotice(
          "Units Exceed Holding",
          `You can sell up to ${error.availableUnits} shares for ${error.symbol}.`,
          "error"
        );
        return;
      }

      showTradeNotice(
        isEditingTrade ? "Trade Update Failed" : "Trade Save Failed",
        isEditingTrade
          ? "Could not update this trade locally. Please try again."
          : "Could not save this trade locally. Please try again.",
        "error"
      );
    } finally {
      setIsSubmittingOrder(false);
    }
  }, [
    brokerMode,
    customBrokerFeePctInput,
    customBrokerNameInput,
    deductCgtTaxOnSell,
    priceInput,
    selectedSymbol,
    savedBrokerSettings,
    symbolQuote.lastPrice,
    taxpayerProfile,
    tradeDateTime,
    tradeSide,
    unitsInput,
    isEditingTrade,
    normalizedEditTradeId,
    cashGuardEnabled,
    refreshCashLedger,
    showTradeNotice,
  ]);

  const handleStartTradeDateTimeSelection = React.useCallback(() => {
    setTradeDateTimePickerMode("date");
    setIsAwaitingTimeSelection(false);
    setIsTradeDateTimePickerVisible(true);
  }, []);

  const handleTradeDateTimeChange = React.useCallback(
    (event: DateTimePickerEvent, selectedValue?: Date) => {
      if (event.type === "dismissed" || !selectedValue) {
        setIsTradeDateTimePickerVisible(false);
        setIsAwaitingTimeSelection(false);
        setTradeDateTimePickerMode("date");
        return;
      }

      if (tradeDateTimePickerMode === "date") {
        setTradeDateTime((currentValue) => {
          const nextValue = new Date(currentValue);
          nextValue.setFullYear(
            selectedValue.getFullYear(),
            selectedValue.getMonth(),
            selectedValue.getDate()
          );
          return nextValue;
        });

        setTradeDateTimePickerMode("time");
        setIsAwaitingTimeSelection(true);

        if (Platform.OS === "android") {
          setIsTradeDateTimePickerVisible(false);
          setTimeout(() => {
            setIsTradeDateTimePickerVisible(true);
          }, 0);
        }
        return;
      }

      setTradeDateTime((currentValue) => {
        const nextValue = new Date(currentValue);
        nextValue.setHours(selectedValue.getHours(), selectedValue.getMinutes());
        return nextValue;
      });

      setIsTradeDateTimePickerVisible(false);
      setIsAwaitingTimeSelection(false);
      setTradeDateTimePickerMode("date");
    },
    [tradeDateTimePickerMode]
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          className="flex-1"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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
              <AppBackIconButton onPress={handleBackFromTrade} />

              <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
                {isEditingTrade ? "Edit Trade" : "Trade"}
              </Text>

              <View className="w-14" />
            </View>

            <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Symbol Search
            </Text>

            <TextInput
              value={symbolSearchQuery}
              onChangeText={setSymbolSearchQuery}
              placeholder="Search symbol or company"
              placeholderTextColor={inputPlaceholderTextColor}
              editable={!isSymbolLocked}
              className="mt-3 rounded-xl bg-brand-white/70 px-3 py-2 text-sm font-semibold text-app-text dark:bg-brand-white/5 dark:text-app-textDark"
            />

            {isSymbolLocked ? (
              <Text className="mt-2 text-xs font-semibold text-app-highlight dark:text-app-highlightDark">
                Symbol is locked from portfolio action.
              </Text>
            ) : null}

            <View className="mt-3 gap-2">
              {filteredSymbols.map((symbolItem) => (
                <TouchableOpacity
                  key={symbolItem.symbol}
                  activeOpacity={0.88}
                  disabled={isSymbolLocked}
                  onPress={() => handleSelectSymbol(symbolItem.symbol)}
                  className={[
                    "rounded-xl px-3 py-2",
                    selectedSymbol === symbolItem.symbol
                      ? "bg-app-highlight dark:bg-app-highlightDark"
                      : "bg-brand-white/70 dark:bg-brand-white/5",
                    isSymbolLocked ? "opacity-60" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <View className="flex-row items-center gap-2">
                    <Text
                      className={[
                        "text-sm font-bold",
                        selectedSymbol === symbolItem.symbol
                          ? "text-brand-white dark:text-brand-purple"
                          : "text-app-text dark:text-app-textDark",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {symbolItem.symbol}
                    </Text>
                    {isShariahCompliantSymbol(symbolItem.symbol) ? (
                      <ShariahChip compact />
                    ) : null}
                  </View>
                  <Text
                    className={[
                      "mt-1 text-xs",
                      selectedSymbol === symbolItem.symbol
                        ? "text-brand-white dark:text-brand-purple"
                        : "text-app-text dark:text-app-textDark",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    numberOfLines={1}
                  >
                    {symbolItem.name}
                  </Text>
                </TouchableOpacity>
              ))}

              {filteredSymbols.length === 0 ? (
                symbolSearchQuery.trim().length > 0 ? (
                  <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                    No symbols found.
                  </Text>
                ) : null
              ) : null}
            </View>

            <View className="mt-3 rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
              <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                Last Price / Change
              </Text>
              <Text className="mt-1 text-base font-bold text-app-text dark:text-app-textDark">
                {formatPKRAmount(symbolQuote.lastPrice)}
              </Text>
              <Text
                className={[
                  "mt-1 text-sm font-semibold",
                  getChangeTextClassName(symbolQuote.change),
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {`${formatPKRAmount(symbolQuote.change)} (${formatSignedPercentage(symbolQuote.changePct)})`}
              </Text>
            </View>
          </View>

            <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                Trade Form
              </Text>

              <View className="flex-row items-center gap-2">
                <ToggleChip
                  label="Buy"
                  selected={tradeSide === "buy"}
                  onPress={() => setTradeSide("buy")}
                />
                <ToggleChip
                  label="Sell"
                  selected={tradeSide === "sell"}
                  selectedTone="danger"
                  onPress={() => setTradeSide("sell")}
                />
              </View>
            </View>

            <View className="mt-4 gap-3">
              {cashGuardEnabled ? (
                <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Cash Guard
                  </Text>
                  <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
                    {`Available Cash: ${formatPKRAmount(availableCash)}`}
                  </Text>
                  <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                    Buy orders cannot exceed available cash while Cash Guard is enabled.
                  </Text>
                </View>
              ) : null}

              <View className="flex-row gap-3">
                <FieldInput
                  label="Price"
                  value={priceInput}
                  onChangeText={(nextValue) => {
                    setHasEditedPrice(true);
                    setPriceInput(nextValue);
                  }}
                  placeholderTextColor={inputPlaceholderTextColor}
                  keyboardType="numeric"
                  placeholder="Auto from last price"
                />
                <FieldInput
                  label="Units"
                  value={unitsInput}
                  onChangeText={setUnitsInput}
                  placeholderTextColor={inputPlaceholderTextColor}
                  keyboardType="numeric"
                  placeholder="Shares"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Broker Mode
                  </Text>
                  <View className="mt-1 flex-row gap-2">
                    <ToggleChip
                      label="Saved"
                      selected={brokerMode === "saved"}
                      onPress={() => setBrokerMode("saved")}
                    />
                    <ToggleChip
                      label="Custom"
                      selected={brokerMode === "custom"}
                      onPress={() => setBrokerMode("custom")}
                    />
                  </View>
                </View>

                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Trade Date & Time
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={handleStartTradeDateTimeSelection}
                    className="mt-1 rounded-xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/5"
                  >
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      {formatDateTimeInput(tradeDateTime)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="flex-row gap-3">
                {brokerMode === "saved" ? (
                  <FieldInput
                    label="Broker"
                    value={savedBrokerSettings?.brokerName ?? "Not configured"}
                    placeholderTextColor={inputPlaceholderTextColor}
                    editable={false}
                  />
                ) : (
                  <FieldInput
                    label="Broker"
                    value={customBrokerNameInput}
                    onChangeText={setCustomBrokerNameInput}
                    placeholderTextColor={inputPlaceholderTextColor}
                    placeholder="Custom broker name"
                  />
                )}

                {brokerMode === "custom" ? (
                  <FieldInput
                    label="Broker Fee %"
                    value={customBrokerFeePctInput}
                    onChangeText={setCustomBrokerFeePctInput}
                    placeholderTextColor={inputPlaceholderTextColor}
                    keyboardType="numeric"
                    placeholder="e.g. 0.15"
                  />
                ) : (
                  <FieldInput
                    label="Broker Fee %"
                    value={
                      savedBrokerSettings
                        ? `${savedBrokerSettings.transactionFeePct}%`
                        : "Not configured"
                    }
                    placeholderTextColor={inputPlaceholderTextColor}
                    editable={false}
                  />
                )}
              </View>

              {brokerMode === "saved" && !savedBrokerSettings ? (
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => router.push("/broker-settings")}
                  className="self-start rounded-xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/5"
                >
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                    Configure Broker Settings
                  </Text>
                </TouchableOpacity>
              ) : null}

              {tradeSide === "sell" ? (
                <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    CGT Tax
                  </Text>
                  <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
                    {`Profile: ${getTaxpayerProfileLabel(taxpayerProfile)} (${CGT_RATE_BY_PROFILE[taxpayerProfile]}% on profit)`}
                  </Text>

                  <View className="mt-2 flex-row items-center gap-2">
                    <ToggleChip
                      label="Deduct"
                      selected={deductCgtTaxOnSell}
                      onPress={() => setDeductCgtTaxOnSell(true)}
                    />
                    <ToggleChip
                      label="Skip"
                      selected={!deductCgtTaxOnSell}
                      onPress={() => setDeductCgtTaxOnSell(false)}
                    />
                  </View>

                  <Text className="mt-2 text-xs font-semibold text-app-text dark:text-app-textDark">
                    {deductCgtTaxOnSell
                      ? "CGT will be deducted only when this sell is in profit."
                      : "No CGT will be deducted for this sell order."}
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="mt-5">
              <AppButton
                label={
                  tradeSide === "buy"
                    ? isEditingTrade
                      ? "Update Buy Order"
                      : "Create Buy Order"
                    : isEditingTrade
                      ? "Update Sell Order"
                      : "Create Sell Order"
                }
                variant={tradeSide === "buy" ? "primary" : "danger"}
                loading={isSubmittingOrder}
                onPress={handleCreateOrder}
              />
            </View>

            {isTradeDateTimePickerVisible ? (
              <View className="mt-4 rounded-2xl bg-brand-white/70 p-2 dark:bg-brand-white/5">
                <Text className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                  {isAwaitingTimeSelection ? "Pick Time" : "Pick Date"}
                </Text>
                <DateTimePicker
                  key={tradeDateTimePickerMode}
                  value={tradeDateTime}
                  mode={tradeDateTimePickerMode}
                  display="default"
                  onChange={handleTradeDateTimeChange}
                />
              </View>
            ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AppFeedbackModal
        visible={tradeNotice !== null}
        title={tradeNotice?.title ?? ""}
        message={tradeNotice?.message ?? ""}
        tone={tradeNotice?.tone ?? "info"}
        actionLabel="Done"
        onClose={handleCloseTradeNotice}
      />
    </SafeAreaView>
  );
}
