import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/src/lib/navigation";
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
  getAutoTaxDeductionEnabledPreference,
  BrokerSettings,
  getDefaultBrokerSettings,
  getDeductTaxFromCgtEnabledPreference,
  getEffectiveCgtTaxRatePreference,
  getBrokerSettings,
  getSellScreenCgtDeductionEnabledPreference,
  getTradeScreenBrokerDeductionEnabledPreference,
  getTaxComputationModePreference,
  getTaxpayerProfilePreference,
  setTradeScreenBrokerDeductionEnabledPreference,
  setSellScreenCgtDeductionEnabledPreference,
  TaxComputationMode,
  TaxpayerProfile,
} from "@/src/lib/app-preferences";
import {
  calculateBrokerDeductionBreakdown,
  calculateBrokerFeeAmount,
  DEFAULT_BROKER_COMMISSION_PCT,
  DEFAULT_CDC_CHARGE_PER_SHARE,
} from "@/src/lib/broker-fee";
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
import { getPositionSnapshotForSymbol } from "@/src/features/portfolio/position-ledger";

const TRADE_QUOTE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type TradeSide = "buy" | "sell";
type TradeNoticeState = {
  title: string;
  message: string;
  tone: AppFeedbackModalTone;
};

const DEFAULT_CGT_TAX_RATE_PCT = 30;

function getTaxpayerProfileLabel(profile: TaxpayerProfile): string {
  return profile === "filer" ? "Filer" : "Non-Filer";
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTradeDateForStorage(date: Date): string {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(12, 0, 0, 0);
  return normalizedDate.toISOString();
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

function parseNumericInput(value: string): number {
  return Number(value.trim().replace(/,/g, ""));
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
        className="mt-1 rounded-xl border border-app-highlight/25 bg-app-highlight/8 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/35 dark:bg-brand-white/5 dark:text-app-textDark"
      />
    </View>
  );
}

export default function TransactionsTabScreen() {
  const router = useGuardedRouter();
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
  const switchTrackOnColor = isDarkMode
    ? "rgba(255, 255, 255, 0.82)"
    : APP_COLORS.app.highlight;
  const switchTrackOffColor = isDarkMode
    ? "rgba(255, 255, 255, 0.28)"
    : "rgba(20, 10, 38, 0.22)";
  const [tradeSide, setTradeSide] = React.useState<TradeSide>("buy");
  const [isBrokerDeductionEnabled, setIsBrokerDeductionEnabled] =
    React.useState(true);

  const [symbols, setSymbols] = React.useState<PsxSymbol[]>([]);
  const [symbolSearchQuery, setSymbolSearchQuery] = React.useState("");
  const [selectedSymbol, setSelectedSymbol] = React.useState("");
  const [symbolQuote, setSymbolQuote] = React.useState<SymbolQuote>(
    getSymbolQuoteFallback("")
  );

  const [priceInput, setPriceInput] = React.useState("");
  const [unitsInput, setUnitsInput] = React.useState("");
  const [tradeDateTime, setTradeDateTime] = React.useState(new Date());
  const [isTradeDateTimePickerVisible, setIsTradeDateTimePickerVisible] =
    React.useState(false);
  const [savedBrokerSettings, setSavedBrokerSettings] =
    React.useState<BrokerSettings | null>(null);
  const [taxpayerProfile, setTaxpayerProfile] =
    React.useState<TaxpayerProfile>("nonFiler");
  const [taxComputationMode, setTaxComputationMode] =
    React.useState<TaxComputationMode>("default");
  const [effectiveCgtTaxRatePct, setEffectiveCgtTaxRatePct] = React.useState(
    DEFAULT_CGT_TAX_RATE_PCT
  );
  const [autoTaxDeductionEnabled, setAutoTaxDeductionEnabled] =
    React.useState(true);
  const [deductTaxFromCgtEnabled, setDeductTaxFromCgtEnabled] =
    React.useState(true);
  const [sellScreenCgtDeductionEnabled, setSellScreenCgtDeductionEnabled] =
    React.useState(true);
  const [hasEditedPrice, setHasEditedPrice] = React.useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [tradeNotice, setTradeNotice] = React.useState<TradeNoticeState | null>(null);
  const [shouldGoBackAfterNotice, setShouldGoBackAfterNotice] =
    React.useState(false);
  const [sellPositionSnapshot, setSellPositionSnapshot] = React.useState<{
    units: number;
    averageBuyPrice: number;
  } | null>(null);

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

  const loadTaxpayerProfile = React.useCallback(async () => {
    const [
      savedTaxpayerProfile,
      savedTaxComputationMode,
      savedEffectiveCgtTaxRatePct,
      isAutoTaxDeductionEnabled,
      isDeductTaxFromCgtEnabled,
      isSellScreenCgtDeductionEnabled,
      isTradeScreenBrokerDeductionEnabled,
    ] = await Promise.all([
      getTaxpayerProfilePreference(),
      getTaxComputationModePreference(),
      getEffectiveCgtTaxRatePreference(),
      getAutoTaxDeductionEnabledPreference(),
      getDeductTaxFromCgtEnabledPreference(),
      getSellScreenCgtDeductionEnabledPreference(),
      getTradeScreenBrokerDeductionEnabledPreference(),
    ]);
    setTaxpayerProfile(savedTaxpayerProfile);
    setTaxComputationMode(savedTaxComputationMode);
    setEffectiveCgtTaxRatePct(savedEffectiveCgtTaxRatePct);
    setAutoTaxDeductionEnabled(isAutoTaxDeductionEnabled);
    setDeductTaxFromCgtEnabled(isDeductTaxFromCgtEnabled);
    setSellScreenCgtDeductionEnabled(isSellScreenCgtDeductionEnabled);
    setIsBrokerDeductionEnabled(isTradeScreenBrokerDeductionEnabled);
  }, []);

  const handleSellScreenCgtDeductionToggle = React.useCallback(
    async (nextValue: boolean) => {
      setSellScreenCgtDeductionEnabled(nextValue);
      try {
        await setSellScreenCgtDeductionEnabledPreference(nextValue);
      } catch {
        // Keep current UI selection even if persistence fails.
      }
    },
    []
  );

  const handleBrokerDeductionToggle = React.useCallback(
    async (nextValue: boolean) => {
      setIsBrokerDeductionEnabled(nextValue);
      try {
        await setTradeScreenBrokerDeductionEnabledPreference(nextValue);
      } catch {
        // Keep current UI selection even if persistence fails.
      }
    },
    []
  );

  const loadSavedBrokerSettings = React.useCallback(async () => {
    const brokerSettings = await getBrokerSettings();
    setSavedBrokerSettings(brokerSettings ?? getDefaultBrokerSettings());
  }, []);

  const handlePullToRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshSymbols();
      await refreshQuoteForSymbol(selectedSymbol);
      await loadTaxpayerProfile();
      await loadSavedBrokerSettings();
    } finally {
      setIsRefreshing(false);
    }
  }, [
    loadSavedBrokerSettings,
    loadTaxpayerProfile,
    refreshQuoteForSymbol,
    refreshSymbols,
    selectedSymbol,
  ]);

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

  useFocusEffect(
    React.useCallback(() => {
      void loadSavedBrokerSettings();
      void loadTaxpayerProfile();
    }, [loadSavedBrokerSettings, loadTaxpayerProfile])
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

  React.useEffect(() => {
    let isMounted = true;
    const normalizedSymbol = selectedSymbol.trim().toUpperCase();

    if (tradeSide !== "sell" || normalizedSymbol.length === 0) {
      setSellPositionSnapshot(null);
      return () => {
        isMounted = false;
      };
    }

    async function hydrateSellPosition() {
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

      if (isMounted) {
        setSellPositionSnapshot(positionSnapshot);
      }
    }

    void hydrateSellPosition();
    return () => {
      isMounted = false;
    };
  }, [isEditingTrade, normalizedEditTradeId, selectedSymbol, tradeSide]);

  const parsedPrice = React.useMemo(
    () => parseNumericInput(priceInput),
    [priceInput]
  );
  const parsedUnits = React.useMemo(
    () => parseNumericInput(unitsInput),
    [unitsInput]
  );
  const hasValidPrice = Number.isFinite(parsedPrice) && parsedPrice > 0;
  const hasValidUnits =
    Number.isFinite(parsedUnits) && parsedUnits > 0 && Number.isInteger(parsedUnits);
  const hasTradeInputs = hasValidPrice && hasValidUnits;

  const effectiveBrokerCommissionPct = React.useMemo(() => {
    const savedCommission = savedBrokerSettings?.transactionFeeValue;
    if (typeof savedCommission !== "number" || !Number.isFinite(savedCommission)) {
      return DEFAULT_BROKER_COMMISSION_PCT;
    }

    return Math.max(0, savedCommission);
  }, [savedBrokerSettings?.transactionFeeValue]);

  const effectiveCdcChargePerShare = React.useMemo(() => {
    const savedCdcChargePerShare = savedBrokerSettings?.cdcChargePerShare;
    if (
      typeof savedCdcChargePerShare !== "number" ||
      !Number.isFinite(savedCdcChargePerShare)
    ) {
      return DEFAULT_CDC_CHARGE_PER_SHARE;
    }

    return Math.max(0, savedCdcChargePerShare);
  }, [savedBrokerSettings?.cdcChargePerShare]);

  const estimatedGrossTradeAmount = React.useMemo(() => {
    if (!hasTradeInputs) {
      return 0;
    }

    return parsedPrice * parsedUnits;
  }, [hasTradeInputs, parsedPrice, parsedUnits]);

  const estimatedBrokerFeeAmount = React.useMemo(() => {
    if (!hasTradeInputs) {
      return 0;
    }

    return calculateBrokerFeeAmount({
      price: parsedPrice,
      units: parsedUnits,
      brokerFeeType: "percentage",
      brokerFeeValue: isBrokerDeductionEnabled ? effectiveBrokerCommissionPct : 0,
      cdcChargePerShare: isBrokerDeductionEnabled ? effectiveCdcChargePerShare : 0,
    });
  }, [
    effectiveCdcChargePerShare,
    effectiveBrokerCommissionPct,
    hasTradeInputs,
    isBrokerDeductionEnabled,
    parsedPrice,
    parsedUnits,
  ]);

  const estimatedBrokerDeductionBreakdown = React.useMemo(
    () =>
      calculateBrokerDeductionBreakdown({
        price: parsedPrice,
        units: parsedUnits,
        brokerFeeType: "percentage",
        brokerFeeValue: isBrokerDeductionEnabled ? effectiveBrokerCommissionPct : 0,
        cdcChargePerShare: isBrokerDeductionEnabled ? effectiveCdcChargePerShare : 0,
      }),
    [
      effectiveCdcChargePerShare,
      effectiveBrokerCommissionPct,
      isBrokerDeductionEnabled,
      parsedPrice,
      parsedUnits,
    ]
  );

  const estimatedTradeFinalAmount = React.useMemo(() => {
    if (!hasTradeInputs) {
      return 0;
    }

    return tradeSide === "buy"
      ? estimatedGrossTradeAmount + estimatedBrokerFeeAmount
      : estimatedGrossTradeAmount - estimatedBrokerFeeAmount;
  }, [
    estimatedBrokerFeeAmount,
    estimatedGrossTradeAmount,
    hasTradeInputs,
    tradeSide,
  ]);

  const isCgtDeductionEnabledForPreview =
    autoTaxDeductionEnabled &&
    deductTaxFromCgtEnabled &&
    sellScreenCgtDeductionEnabled;

  const estimatedSellGrossProfit = React.useMemo(() => {
    if (!hasTradeInputs || tradeSide !== "sell" || !sellPositionSnapshot) {
      return 0;
    }

    return (parsedPrice - sellPositionSnapshot.averageBuyPrice) * parsedUnits;
  }, [hasTradeInputs, parsedPrice, parsedUnits, sellPositionSnapshot, tradeSide]);

  const estimatedSellCgtTaxAmount = React.useMemo(() => {
    if (
      !hasTradeInputs ||
      tradeSide !== "sell" ||
      !isCgtDeductionEnabledForPreview ||
      !sellPositionSnapshot
    ) {
      return 0;
    }

    const taxableGain = Math.max(0, estimatedSellGrossProfit);
    if (taxableGain <= 0) {
      return 0;
    }

    return (taxableGain * effectiveCgtTaxRatePct) / 100;
  }, [
    estimatedSellGrossProfit,
    effectiveCgtTaxRatePct,
    hasTradeInputs,
    isCgtDeductionEnabledForPreview,
    sellPositionSnapshot,
    tradeSide,
  ]);

  const estimatedSellNetReceivable = React.useMemo(() => {
    if (!hasTradeInputs || tradeSide !== "sell") {
      return 0;
    }

    return estimatedTradeFinalAmount - estimatedSellCgtTaxAmount;
  }, [
    estimatedSellCgtTaxAmount,
    estimatedTradeFinalAmount,
    hasTradeInputs,
    tradeSide,
  ]);

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

    const parsedPrice = parseNumericInput(priceInput);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      showTradeNotice("Invalid Price", "Enter a valid price greater than 0.", "error");
      return;
    }

    const parsedUnits = parseNumericInput(unitsInput);
    if (!Number.isFinite(parsedUnits) || parsedUnits <= 0) {
      showTradeNotice("Invalid Units", "Enter units greater than 0.", "error");
      return;
    }

    if (!Number.isInteger(parsedUnits)) {
      showTradeNotice("Invalid Units", "Units must be a whole number.", "error");
      return;
    }

    const effectiveBrokerSettings = savedBrokerSettings ?? getDefaultBrokerSettings();
    const brokerModeForTrade =
      effectiveBrokerSettings.profileMode === "custom" ? "custom" : "saved";
    const brokerCommissionPctForTrade = isBrokerDeductionEnabled
      ? Math.max(0, effectiveBrokerSettings.transactionFeeValue)
      : 0;
    const brokerCdcChargePerShareForTrade = isBrokerDeductionEnabled
      ? Math.max(0, effectiveBrokerSettings.cdcChargePerShare)
      : 0;

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
      const taxableGain = Math.max(0, sellGrossProfit);

      const isCgtTaxDeductionEnabled =
        autoTaxDeductionEnabled &&
        deductTaxFromCgtEnabled &&
        sellScreenCgtDeductionEnabled;
      if (isCgtTaxDeductionEnabled && taxableGain > 0) {
        sellCgtRatePct = effectiveCgtTaxRatePct;
        sellCgtTaxAmount = (taxableGain * sellCgtRatePct) / 100;
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
            tradedAt: normalizeTradeDateForStorage(tradeDateTime),
            brokerMode: brokerModeForTrade,
            brokerName: effectiveBrokerSettings.brokerName,
            brokerFeeType: "percentage",
            brokerFeeValue: brokerCommissionPctForTrade,
            brokerCdcChargePerShare: brokerCdcChargePerShareForTrade,
          })
        : await saveTradeOrder({
            side: tradeSide,
            symbol: normalizedSymbol,
            price: parsedPrice,
            units: parsedUnits,
            tradedAt: normalizeTradeDateForStorage(tradeDateTime),
            brokerMode: brokerModeForTrade,
            brokerName: effectiveBrokerSettings.brokerName,
            brokerFeeType: "percentage",
            brokerFeeValue: brokerCommissionPctForTrade,
            brokerCdcChargePerShare: brokerCdcChargePerShareForTrade,
          });

      if (tradeSide === "sell") {
        const messageLines = [
          `You have sold ${savedOrder.units} shares of ${savedOrder.symbol} at ${formatPKRAmount(savedOrder.price)} per share.`,
          `Estimated Gross P/L: ${formatPKRAmount(sellGrossProfit)}.`,
        ];

        if (
          autoTaxDeductionEnabled &&
          deductTaxFromCgtEnabled &&
          sellScreenCgtDeductionEnabled
        ) {
          if (isCgtApplied) {
            const cgtLabel =
              taxComputationMode === "custom"
                ? `CGT (${sellCgtRatePct}%)`
                : `CGT (${getTaxpayerProfileLabel(
                    taxpayerProfile
                  )} ${sellCgtRatePct}%)`;
            messageLines.push(
              `${cgtLabel}: ${formatPKRAmount(-sellCgtTaxAmount)}.`
            );
            messageLines.push(`Estimated Net P/L: ${formatPKRAmount(sellNetProfit)}.`);
          } else {
            messageLines.push("CGT not applied because this sell is not in profit.");
          }
        } else if (!autoTaxDeductionEnabled) {
          messageLines.push("CGT deduction is off because Auto Tax Deduction is disabled in Tax Settings.");
        } else if (!deductTaxFromCgtEnabled) {
          messageLines.push("CGT deduction toggle is disabled in Tax Settings.");
        } else {
          messageLines.push("CGT deduction is off for this sell from the trade-screen toggle.");
        }
        showTradeNotice(
          isEditingTrade ? "Trade Updated" : "Sold Successfully",
          messageLines.join("\n"),
          "success"
        );
        if (isEditingTrade) {
          setShouldGoBackAfterNotice(true);
          return;
        }

        setUnitsInput("");
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
        )} per share.`,
        "success"
      );
      if (isEditingTrade) {
        setShouldGoBackAfterNotice(true);
        return;
      }

      setUnitsInput("");
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
    priceInput,
    selectedSymbol,
    savedBrokerSettings,
    isBrokerDeductionEnabled,
    symbolQuote.lastPrice,
    taxpayerProfile,
    autoTaxDeductionEnabled,
    deductTaxFromCgtEnabled,
    sellScreenCgtDeductionEnabled,
    effectiveCgtTaxRatePct,
    taxComputationMode,
    tradeDateTime,
    tradeSide,
    unitsInput,
    isEditingTrade,
    normalizedEditTradeId,
    showTradeNotice,
  ]);

  const handleStartTradeDateSelection = React.useCallback(() => {
    setIsTradeDateTimePickerVisible(true);
  }, []);

  const handleTradeDateChange = React.useCallback(
    (event: DateTimePickerEvent, selectedValue?: Date) => {
      if (event.type === "dismissed" || !selectedValue) {
        setIsTradeDateTimePickerVisible(false);
        return;
      }

      setTradeDateTime(selectedValue);

      setIsTradeDateTimePickerVisible(false);
    },
    []
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
              className="mt-3 rounded-xl border border-app-highlight/25 bg-app-highlight/8 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/35 dark:bg-brand-white/5 dark:text-app-textDark"
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

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Trade Date
                </Text>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleStartTradeDateSelection}
                  className="mt-1 rounded-xl border border-app-highlight/25 bg-app-highlight/8 px-3 py-2 dark:border-app-highlightDark/35 dark:bg-brand-white/5"
                >
                  <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                    {formatDateInput(tradeDateTime)}
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center justify-between rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                <View className="mr-3 flex-1">
                  <Text className="text-xs font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Deduct Broker Charges
                  </Text>
                  <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                    This toggle is saved until you change it.
                  </Text>
                </View>
                <Switch
                  value={isBrokerDeductionEnabled}
                  onValueChange={(nextValue) => {
                    void handleBrokerDeductionToggle(nextValue);
                  }}
                  thumbColor={APP_COLORS.brand.white}
                  ios_backgroundColor={switchTrackOffColor}
                  trackColor={{
                    true: switchTrackOnColor,
                    false: switchTrackOffColor,
                  }}
                />
              </View>

              {tradeSide === "sell" ? (
                <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    CGT Tax
                  </Text>
                  <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
                    {taxComputationMode === "custom"
                      ? `Mode: Custom (${effectiveCgtTaxRatePct}% on profit)`
                      : `Mode: Default • ${getTaxpayerProfileLabel(taxpayerProfile)} (${effectiveCgtTaxRatePct}% on profit)`}
                  </Text>
                  <Text className="mt-2 text-xs font-semibold text-app-text dark:text-app-textDark">
                    {!autoTaxDeductionEnabled
                      ? "Auto tax deduction is disabled in Tax Settings."
                      : !deductTaxFromCgtEnabled
                        ? "CGT deduction toggle is disabled in Tax Settings."
                        : !sellScreenCgtDeductionEnabled
                          ? "CGT deduction is off for this sell from the toggle below."
                          : "CGT will be deducted only when this sell is in profit."}
                  </Text>

                  <View className="mt-3 flex-row items-center justify-between rounded-xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/10">
                    <View className="mr-3 flex-1">
                      <Text className="text-xs font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Deduct CGT for Sell
                      </Text>
                      <Text className="mt-1 text-xs font-semibold text-app-text dark:text-app-textDark">
                        This preference is saved until you change it.
                      </Text>
                    </View>
                    <Switch
                      value={sellScreenCgtDeductionEnabled}
                      onValueChange={(nextValue) => {
                        void handleSellScreenCgtDeductionToggle(nextValue);
                      }}
                      thumbColor={APP_COLORS.brand.white}
                      ios_backgroundColor={switchTrackOffColor}
                      trackColor={{
                        true: switchTrackOnColor,
                        false: switchTrackOffColor,
                      }}
                    />
                  </View>
                </View>
              ) : null}

              <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Final Amount Preview
                </Text>

                {hasTradeInputs ? (
                  <View className="mt-2 gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Gross
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(estimatedGrossTradeAmount)}
                      </Text>
                    </View>

                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Broker Commission
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(
                          estimatedBrokerDeductionBreakdown.brokerCommissionAmount
                        )}
                      </Text>
                    </View>

                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        SST
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(estimatedBrokerDeductionBreakdown.sstAmount)}
                      </Text>
                    </View>

                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        CDC
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(estimatedBrokerDeductionBreakdown.cdcAmount)}
                      </Text>
                    </View>

                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        Total Broker Deduction
                      </Text>
                      <Text className="text-sm font-bold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(estimatedBrokerFeeAmount)}
                      </Text>
                    </View>

                    <View className="mt-1 h-px bg-app-highlight/20 dark:bg-app-highlightDark/25" />

                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                        {tradeSide === "buy" ? "Final Payable" : "Final Receivable"}
                      </Text>
                      <Text className="text-base font-extrabold text-app-text dark:text-app-textDark">
                        {formatPKRAmount(
                          tradeSide === "buy"
                            ? estimatedTradeFinalAmount
                            : estimatedSellNetReceivable
                        )}
                      </Text>
                    </View>

                    {tradeSide === "sell" ? (
                      <>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                            Est. CGT
                          </Text>
                          <Text className="text-sm font-bold text-brand-red">
                            {formatPKRAmount(-estimatedSellCgtTaxAmount)}
                          </Text>
                        </View>

                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                            Est. Net P/L
                          </Text>
                          <Text
                            className={[
                              "text-sm font-bold",
                              getChangeTextClassName(
                                estimatedSellGrossProfit - estimatedSellCgtTaxAmount
                              ),
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {formatPKRAmount(
                              estimatedSellGrossProfit - estimatedSellCgtTaxAmount
                            )}
                          </Text>
                        </View>
                      </>
                    ) : null}
                  </View>
                ) : (
                  <Text className="mt-2 text-xs font-semibold text-app-text dark:text-app-textDark">
                    Enter valid price and units to see final buy/sell amount.
                  </Text>
                )}
              </View>
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
                  Pick Date
                </Text>
                <DateTimePicker
                  value={tradeDateTime}
                  mode="date"
                  display="default"
                  themeVariant={isDarkMode ? "dark" : "light"}
                  onChange={handleTradeDateChange}
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
