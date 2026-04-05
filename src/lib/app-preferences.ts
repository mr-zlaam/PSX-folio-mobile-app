import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import {
  BrokerFeeType,
  DEFAULT_BROKER_COMMISSION_PCT,
  normalizeBrokerFeeType,
} from "@/src/lib/broker-fee";

export type AppTheme = "light" | "dark";
export type HomeInsightDisplayModePreference = "percentage" | "price";
export type PortfolioGroupingModePreference = "sectors" | "companies";
export type PortfolioDisplayModePreference = "percentage" | "price";
export type TaxpayerProfile = "filer" | "nonFiler";
export type TaxComputationMode = "default" | "custom";
export type TaxRateByProfile = Record<TaxpayerProfile, number>;
export type BrokerProfileMode = "default" | "custom";
export type BrokerSettings = {
  brokerName: string;
  transactionFeeType: BrokerFeeType;
  transactionFeeValue: number;
  profileMode: BrokerProfileMode;
  cdcChargePerShare: number;
};

const STORAGE_KEYS = {
  onboardingComplete: "@psx-portfolio/onboarding-complete",
  themePreference: "@psx-portfolio/theme-preference",
  homeInsightDisplayMode: "@psx-portfolio/home-insight-display-mode",
  portfolioGroupingMode: "@psx-portfolio/portfolio-grouping-mode",
  portfolioDisplayMode: "@psx-portfolio/portfolio-display-mode",
  taxpayerProfile: "@psx-portfolio/taxpayer-profile",
  taxComputationMode: "@psx-portfolio/tax-computation-mode",
  autoTaxDeductionEnabled: "@psx-portfolio/auto-tax-deduction-enabled",
  deductTaxFromCgtEnabled: "@psx-portfolio/deduct-tax-from-cgt-enabled",
  sellScreenCgtDeductionEnabled: "@psx-portfolio/sell-screen-cgt-deduction-enabled",
  tradeScreenBrokerDeductionEnabled:
    "@psx-portfolio/trade-screen-broker-deduction-enabled",
  deductTaxFromDividendEnabled: "@psx-portfolio/deduct-tax-from-dividend-enabled",
  customCgtTaxRatePct: "@psx-portfolio/custom-cgt-tax-rate-pct",
  customDividendTaxRatePct: "@psx-portfolio/custom-dividend-tax-rate-pct",
  filerTaxRatePct: "@psx-portfolio/filer-tax-rate-pct",
  nonFilerTaxRatePct: "@psx-portfolio/non-filer-tax-rate-pct",
  brokerSettings: "@psx-portfolio/broker-settings",
  dividendAutoReinvestEnabled: "@psx-portfolio/dividend-auto-reinvest-enabled",
  allTimeHighPortfolioWorth: "@psx-portfolio/all-time-high-portfolio-worth",
} as const;

const HOME_INSIGHT_DISPLAY_MODE_VALUES: readonly HomeInsightDisplayModePreference[] = [
  "percentage",
  "price",
];
const PORTFOLIO_GROUPING_MODE_VALUES: readonly PortfolioGroupingModePreference[] = [
  "sectors",
  "companies",
];
const PORTFOLIO_DISPLAY_MODE_VALUES: readonly PortfolioDisplayModePreference[] = [
  "percentage",
  "price",
];
const TAXPAYER_PROFILE_VALUES: readonly TaxpayerProfile[] = [
  "filer",
  "nonFiler",
];
const TAX_COMPUTATION_MODE_VALUES: readonly TaxComputationMode[] = [
  "default",
  "custom",
];
const DEFAULT_CGT_TAX_RATE_BY_PROFILE: TaxRateByProfile = {
  filer: 15,
  nonFiler: 15,
};

const DEFAULT_DIVIDEND_TAX_RATE_BY_PROFILE: TaxRateByProfile = {
  filer: 15,
  nonFiler: 30,
};

const DEFAULT_BROKER_SETTINGS: BrokerSettings = {
  brokerName: "Default Broker",
  transactionFeeType: "percentage",
  transactionFeeValue: DEFAULT_BROKER_COMMISSION_PCT,
  profileMode: "default",
  cdcChargePerShare: 0.005,
};

type PreferencesStore = Record<string, string>;

const PREFERENCES_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-preferences.json`
  : null;

let isAsyncStorageAvailable: boolean | null = null;

async function readPreferencesFromFile(): Promise<PreferencesStore> {
  if (!PREFERENCES_FILE_URI) {
    return {};
  }

  try {
    const storedRaw = await FileSystem.readAsStringAsync(PREFERENCES_FILE_URI);
    const parsed = JSON.parse(storedRaw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const normalizedEntries = Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    );

    return Object.fromEntries(normalizedEntries);
  } catch {
    return {};
  }
}

async function writePreferencesToFile(store: PreferencesStore): Promise<void> {
  if (!PREFERENCES_FILE_URI) {
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(PREFERENCES_FILE_URI, JSON.stringify(store));
  } catch {
    // Ignore file-system write errors to avoid blocking app startup.
  }
}

async function readFromFallbackStorage(key: string): Promise<string | null> {
  const fallbackStore = await readPreferencesFromFile();
  return fallbackStore[key] ?? null;
}

async function writeToFallbackStorage(key: string, value: string): Promise<void> {
  const fallbackStore = await readPreferencesFromFile();
  fallbackStore[key] = value;
  await writePreferencesToFile(fallbackStore);
}

async function removeFromFallbackStorage(key: string): Promise<void> {
  const fallbackStore = await readPreferencesFromFile();
  if (!(key in fallbackStore)) {
    return;
  }
  delete fallbackStore[key];
  await writePreferencesToFile(fallbackStore);
}

async function getStoredItem(key: string): Promise<string | null> {
  if (isAsyncStorageAvailable === false) {
    return readFromFallbackStorage(key);
  }

  try {
    const storedValue = await AsyncStorage.getItem(key);
    isAsyncStorageAvailable = true;
    return storedValue;
  } catch {
    isAsyncStorageAvailable = false;
    return readFromFallbackStorage(key);
  }
}

async function setStoredItem(key: string, value: string): Promise<void> {
  if (isAsyncStorageAvailable !== false) {
    try {
      await AsyncStorage.setItem(key, value);
      isAsyncStorageAvailable = true;
      return;
    } catch {
      isAsyncStorageAvailable = false;
    }
  }

  await writeToFallbackStorage(key, value);
}

async function removeStoredItem(key: string): Promise<void> {
  if (isAsyncStorageAvailable !== false) {
    try {
      await AsyncStorage.removeItem(key);
      isAsyncStorageAvailable = true;
      return;
    } catch {
      isAsyncStorageAvailable = false;
    }
  }

  await removeFromFallbackStorage(key);
}

async function getEnumPreference<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue: T
): Promise<T> {
  const storedValue = await getStoredItem(key);
  if (storedValue && allowedValues.includes(storedValue as T)) {
    return storedValue as T;
  }

  return defaultValue;
}

function parseBrokerSettings(rawValue: string | null): BrokerSettings | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as
      | (Partial<BrokerSettings> & { transactionFeePct?: unknown })
      | null;
    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return null;
    }
    const legacyFeePct =
      typeof parsedValue.transactionFeePct === "number" &&
      Number.isFinite(parsedValue.transactionFeePct) &&
      parsedValue.transactionFeePct >= 0
        ? parsedValue.transactionFeePct
        : null;

    const normalizedFeeType = normalizeBrokerFeeType(
      typeof parsedValue.transactionFeeType === "string"
        ? parsedValue.transactionFeeType
        : null
    );
    const normalizedProfileMode: BrokerProfileMode =
      parsedValue.profileMode === "custom" ? "custom" : "default";
    const normalizedBrokerName =
      typeof parsedValue.brokerName === "string" &&
      parsedValue.brokerName.trim().length > 0
        ? parsedValue.brokerName.trim()
        : normalizedProfileMode === "custom"
          ? "Custom Broker"
          : "Default Broker";
    const parsedFeeValue =
      typeof parsedValue.transactionFeeValue === "number" &&
      Number.isFinite(parsedValue.transactionFeeValue) &&
      parsedValue.transactionFeeValue >= 0
        ? parsedValue.transactionFeeValue
        : legacyFeePct;
    const normalizedFeeValue =
      parsedFeeValue === null
        ? DEFAULT_BROKER_COMMISSION_PCT
        : normalizedFeeType === "fixed"
          ? DEFAULT_BROKER_COMMISSION_PCT
          : parsedFeeValue;
    const normalizedCdcChargePerShare =
      typeof parsedValue.cdcChargePerShare === "number" &&
      Number.isFinite(parsedValue.cdcChargePerShare) &&
      parsedValue.cdcChargePerShare >= 0
        ? parsedValue.cdcChargePerShare
        : DEFAULT_BROKER_SETTINGS.cdcChargePerShare;

    return {
      brokerName: normalizedBrokerName,
      transactionFeeType: "percentage",
      transactionFeeValue: normalizedFeeValue,
      profileMode: normalizedProfileMode,
      cdcChargePerShare: normalizedCdcChargePerShare,
    };
  } catch {
    return null;
  }
}

function parseTaxRatePct(rawValue: string | null): number | null {
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);
  if (
    !Number.isFinite(parsedValue) ||
    parsedValue < 0 ||
    parsedValue > 100
  ) {
    return null;
  }

  return parsedValue;
}

function getTaxRateStorageKey(profile: TaxpayerProfile): string {
  return profile === "filer"
    ? STORAGE_KEYS.filerTaxRatePct
    : STORAGE_KEYS.nonFilerTaxRatePct;
}

export async function getOnboardingComplete(): Promise<boolean> {
  const storedValue = await getStoredItem(STORAGE_KEYS.onboardingComplete);
  return storedValue === "true";
}

export async function setOnboardingComplete(value: boolean): Promise<void> {
  await setStoredItem(STORAGE_KEYS.onboardingComplete, String(value));
}

export async function getThemePreference(): Promise<AppTheme | null> {
  const storedValue = await getStoredItem(STORAGE_KEYS.themePreference);
  if (storedValue === "light" || storedValue === "dark") {
    return storedValue;
  }
  return null;
}

export async function setThemePreference(theme: AppTheme): Promise<void> {
  await setStoredItem(STORAGE_KEYS.themePreference, theme);
}

export async function clearThemePreference(): Promise<void> {
  await removeStoredItem(STORAGE_KEYS.themePreference);
}

export async function getDividendAutoReinvestEnabledPreference(): Promise<boolean> {
  const storedValue = await getStoredItem(
    STORAGE_KEYS.dividendAutoReinvestEnabled
  );
  return storedValue === "true";
}

export async function setDividendAutoReinvestEnabledPreference(
  enabled: boolean
): Promise<void> {
  await setStoredItem(
    STORAGE_KEYS.dividendAutoReinvestEnabled,
    String(enabled)
  );
}

export async function getHomeInsightDisplayModePreference(): Promise<HomeInsightDisplayModePreference> {
  return getEnumPreference(
    STORAGE_KEYS.homeInsightDisplayMode,
    HOME_INSIGHT_DISPLAY_MODE_VALUES,
    "percentage"
  );
}

export async function setHomeInsightDisplayModePreference(
  mode: HomeInsightDisplayModePreference
): Promise<void> {
  await setStoredItem(STORAGE_KEYS.homeInsightDisplayMode, mode);
}

export async function getPortfolioGroupingModePreference(): Promise<PortfolioGroupingModePreference> {
  return getEnumPreference(
    STORAGE_KEYS.portfolioGroupingMode,
    PORTFOLIO_GROUPING_MODE_VALUES,
    "sectors"
  );
}

export async function setPortfolioGroupingModePreference(
  mode: PortfolioGroupingModePreference
): Promise<void> {
  await setStoredItem(STORAGE_KEYS.portfolioGroupingMode, mode);
}

export async function getPortfolioDisplayModePreference(): Promise<PortfolioDisplayModePreference> {
  return getEnumPreference(
    STORAGE_KEYS.portfolioDisplayMode,
    PORTFOLIO_DISPLAY_MODE_VALUES,
    "percentage"
  );
}

export async function setPortfolioDisplayModePreference(
  mode: PortfolioDisplayModePreference
): Promise<void> {
  await setStoredItem(STORAGE_KEYS.portfolioDisplayMode, mode);
}

export async function getTaxpayerProfilePreference(): Promise<TaxpayerProfile> {
  return getEnumPreference(
    STORAGE_KEYS.taxpayerProfile,
    TAXPAYER_PROFILE_VALUES,
    "nonFiler"
  );
}

export async function setTaxpayerProfilePreference(
  profile: TaxpayerProfile
): Promise<void> {
  await setStoredItem(STORAGE_KEYS.taxpayerProfile, profile);
}

export async function getTaxComputationModePreference(): Promise<TaxComputationMode> {
  return getEnumPreference(
    STORAGE_KEYS.taxComputationMode,
    TAX_COMPUTATION_MODE_VALUES,
    "default"
  );
}

export async function setTaxComputationModePreference(
  mode: TaxComputationMode
): Promise<void> {
  await setStoredItem(STORAGE_KEYS.taxComputationMode, mode);
}

export async function getAutoTaxDeductionEnabledPreference(): Promise<boolean> {
  const storedValue = await getStoredItem(STORAGE_KEYS.autoTaxDeductionEnabled);
  if (storedValue === null) {
    return true;
  }
  return storedValue === "true";
}

export async function setAutoTaxDeductionEnabledPreference(
  enabled: boolean
): Promise<void> {
  await setStoredItem(STORAGE_KEYS.autoTaxDeductionEnabled, String(enabled));
}

export async function getDeductTaxFromCgtEnabledPreference(): Promise<boolean> {
  const storedValue = await getStoredItem(STORAGE_KEYS.deductTaxFromCgtEnabled);
  if (storedValue === null) {
    return true;
  }
  return storedValue === "true";
}

export async function setDeductTaxFromCgtEnabledPreference(
  enabled: boolean
): Promise<void> {
  await setStoredItem(STORAGE_KEYS.deductTaxFromCgtEnabled, String(enabled));
}

export async function getSellScreenCgtDeductionEnabledPreference(): Promise<boolean> {
  const storedValue = await getStoredItem(
    STORAGE_KEYS.sellScreenCgtDeductionEnabled
  );
  if (storedValue === null) {
    return true;
  }
  return storedValue === "true";
}

export async function setSellScreenCgtDeductionEnabledPreference(
  enabled: boolean
): Promise<void> {
  await setStoredItem(
    STORAGE_KEYS.sellScreenCgtDeductionEnabled,
    String(enabled)
  );
}

export async function getTradeScreenBrokerDeductionEnabledPreference(): Promise<boolean> {
  const storedValue = await getStoredItem(
    STORAGE_KEYS.tradeScreenBrokerDeductionEnabled
  );
  if (storedValue === null) {
    return true;
  }
  return storedValue === "true";
}

export async function setTradeScreenBrokerDeductionEnabledPreference(
  enabled: boolean
): Promise<void> {
  await setStoredItem(
    STORAGE_KEYS.tradeScreenBrokerDeductionEnabled,
    String(enabled)
  );
}

export async function getDeductTaxFromDividendEnabledPreference(): Promise<boolean> {
  const storedValue = await getStoredItem(
    STORAGE_KEYS.deductTaxFromDividendEnabled
  );
  if (storedValue === null) {
    return true;
  }
  return storedValue === "true";
}

export async function setDeductTaxFromDividendEnabledPreference(
  enabled: boolean
): Promise<void> {
  await setStoredItem(STORAGE_KEYS.deductTaxFromDividendEnabled, String(enabled));
}

export async function getCustomCgtTaxRatePreference(): Promise<number | null> {
  const storedValue = await getStoredItem(STORAGE_KEYS.customCgtTaxRatePct);
  return parseTaxRatePct(storedValue);
}

export async function setCustomCgtTaxRatePreference(
  ratePct: number | null
): Promise<void> {
  if (ratePct === null) {
    await removeStoredItem(STORAGE_KEYS.customCgtTaxRatePct);
    return;
  }

  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    throw new Error("Invalid custom CGT tax rate.");
  }

  await setStoredItem(STORAGE_KEYS.customCgtTaxRatePct, String(ratePct));
}

export async function getCustomDividendTaxRatePreference(): Promise<number | null> {
  const storedValue = await getStoredItem(STORAGE_KEYS.customDividendTaxRatePct);
  return parseTaxRatePct(storedValue);
}

export async function setCustomDividendTaxRatePreference(
  ratePct: number | null
): Promise<void> {
  if (ratePct === null) {
    await removeStoredItem(STORAGE_KEYS.customDividendTaxRatePct);
    return;
  }

  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    throw new Error("Invalid custom dividend tax rate.");
  }

  await setStoredItem(STORAGE_KEYS.customDividendTaxRatePct, String(ratePct));
}

export function getDefaultTaxRateByProfile(
  profile: TaxpayerProfile
): number {
  // Backward-compatible alias for legacy callers expecting one default map.
  return DEFAULT_CGT_TAX_RATE_BY_PROFILE[profile];
}

export function getDefaultCgtTaxRateByProfile(
  profile: TaxpayerProfile
): number {
  return DEFAULT_CGT_TAX_RATE_BY_PROFILE[profile];
}

export function getDefaultDividendTaxRateByProfile(
  profile: TaxpayerProfile
): number {
  return DEFAULT_DIVIDEND_TAX_RATE_BY_PROFILE[profile];
}

export async function getCustomTaxRatePreference(
  profile: TaxpayerProfile
): Promise<number | null> {
  const storageKey = getTaxRateStorageKey(profile);
  const storedValue = await getStoredItem(storageKey);
  return parseTaxRatePct(storedValue);
}

export async function getTaxRateByProfilePreference(
  profile: TaxpayerProfile
): Promise<number> {
  const customRate = await getCustomTaxRatePreference(profile);
  if (customRate !== null) {
    return customRate;
  }

  return getDefaultCgtTaxRateByProfile(profile);
}

export async function getTaxRatesByProfilePreference(): Promise<TaxRateByProfile> {
  const [filerRate, nonFilerRate] = await Promise.all([
    getTaxRateByProfilePreference("filer"),
    getTaxRateByProfilePreference("nonFiler"),
  ]);

  return {
    filer: filerRate,
    nonFiler: nonFilerRate,
  };
}

export async function setCustomTaxRatePreference(
  profile: TaxpayerProfile,
  ratePct: number | null
): Promise<void> {
  const storageKey = getTaxRateStorageKey(profile);
  if (ratePct === null) {
    await removeStoredItem(storageKey);
    return;
  }

  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    throw new Error("Invalid tax rate.");
  }

  await setStoredItem(storageKey, String(ratePct));
}

export async function getEffectiveCgtTaxRatePreference(): Promise<number> {
  const [mode, profile, customRate] = await Promise.all([
    getTaxComputationModePreference(),
    getTaxpayerProfilePreference(),
    getCustomCgtTaxRatePreference(),
  ]);

  if (mode === "custom" && customRate !== null) {
    return customRate;
  }

  return getDefaultCgtTaxRateByProfile(profile);
}

export async function getEffectiveDividendTaxRatePreference(): Promise<number> {
  const [mode, profile, customRate] = await Promise.all([
    getTaxComputationModePreference(),
    getTaxpayerProfilePreference(),
    getCustomDividendTaxRatePreference(),
  ]);

  if (mode === "custom" && customRate !== null) {
    return customRate;
  }

  return getDefaultDividendTaxRateByProfile(profile);
}

export async function getBrokerSettings(): Promise<BrokerSettings | null> {
  const storedValue = await getStoredItem(STORAGE_KEYS.brokerSettings);
  return parseBrokerSettings(storedValue);
}

export function getDefaultBrokerSettings(): BrokerSettings {
  return { ...DEFAULT_BROKER_SETTINGS };
}

export async function setBrokerSettings(
  brokerSettings: BrokerSettings
): Promise<void> {
  const normalizedProfileMode: BrokerProfileMode =
    brokerSettings.profileMode === "custom" ? "custom" : "default";
  const normalizedBrokerName =
    normalizedProfileMode === "custom"
      ? brokerSettings.brokerName.trim().length > 0
        ? brokerSettings.brokerName.trim()
        : "Custom Broker"
      : "Default Broker";
  const normalizedTransactionFeeValue = brokerSettings.transactionFeeValue;
  const normalizedCdcChargePerShare = brokerSettings.cdcChargePerShare;

  if (
    !Number.isFinite(normalizedTransactionFeeValue) ||
    normalizedTransactionFeeValue < 0 ||
    !Number.isFinite(normalizedCdcChargePerShare) ||
    normalizedCdcChargePerShare < 0
  ) {
    throw new Error("Invalid broker settings");
  }

  await setStoredItem(
    STORAGE_KEYS.brokerSettings,
    JSON.stringify({
      brokerName: normalizedBrokerName,
      transactionFeeType: "percentage",
      transactionFeeValue: normalizedTransactionFeeValue,
      profileMode: normalizedProfileMode,
      cdcChargePerShare: normalizedCdcChargePerShare,
    })
  );
}

export async function clearBrokerSettings(): Promise<void> {
  await removeStoredItem(STORAGE_KEYS.brokerSettings);
}

export async function getAllTimeHighPortfolioWorthPreference(): Promise<number> {
  const storedValue = await getStoredItem(STORAGE_KEYS.allTimeHighPortfolioWorth);
  if (!storedValue) {
    return 0;
  }

  const parsedValue = Number(storedValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return parsedValue;
}

export async function setAllTimeHighPortfolioWorthPreference(
  value: number
): Promise<void> {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Invalid all-time high portfolio worth value.");
  }

  await setStoredItem(STORAGE_KEYS.allTimeHighPortfolioWorth, String(value));
}
