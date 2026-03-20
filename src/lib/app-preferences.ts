import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export type AppTheme = "light" | "dark";
export type HomeInsightDisplayModePreference = "percentage" | "price";
export type PortfolioGroupingModePreference = "sectors" | "companies";
export type PortfolioDisplayModePreference = "percentage" | "price";
export type TaxpayerProfile = "filer" | "nonFiler";
export type BrokerSettings = {
  brokerName: string;
  transactionFeePct: number;
};

const STORAGE_KEYS = {
  onboardingComplete: "@psx-portfolio/onboarding-complete",
  themePreference: "@psx-portfolio/theme-preference",
  homeInsightDisplayMode: "@psx-portfolio/home-insight-display-mode",
  portfolioGroupingMode: "@psx-portfolio/portfolio-grouping-mode",
  portfolioDisplayMode: "@psx-portfolio/portfolio-display-mode",
  taxpayerProfile: "@psx-portfolio/taxpayer-profile",
  brokerSettings: "@psx-portfolio/broker-settings",
  cashGuardEnabled: "@psx-portfolio/cash-guard-enabled",
  dividendAutoReinvestEnabled: "@psx-portfolio/dividend-auto-reinvest-enabled",
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
    const parsedValue = JSON.parse(rawValue) as Partial<BrokerSettings>;
    if (
      typeof parsedValue.brokerName !== "string" ||
      parsedValue.brokerName.trim().length === 0
    ) {
      return null;
    }

    if (
      typeof parsedValue.transactionFeePct !== "number" ||
      !Number.isFinite(parsedValue.transactionFeePct) ||
      parsedValue.transactionFeePct < 0
    ) {
      return null;
    }

    return {
      brokerName: parsedValue.brokerName.trim(),
      transactionFeePct: parsedValue.transactionFeePct,
    };
  } catch {
    return null;
  }
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

export async function getCashGuardEnabledPreference(): Promise<boolean> {
  const storedValue = await getStoredItem(STORAGE_KEYS.cashGuardEnabled);
  return storedValue === "true";
}

export async function setCashGuardEnabledPreference(
  enabled: boolean
): Promise<void> {
  await setStoredItem(STORAGE_KEYS.cashGuardEnabled, String(enabled));
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

export async function getBrokerSettings(): Promise<BrokerSettings | null> {
  const storedValue = await getStoredItem(STORAGE_KEYS.brokerSettings);
  return parseBrokerSettings(storedValue);
}

export async function setBrokerSettings(
  brokerSettings: BrokerSettings
): Promise<void> {
  const normalizedBrokerName = brokerSettings.brokerName.trim();
  const normalizedTransactionFeePct = brokerSettings.transactionFeePct;

  if (
    normalizedBrokerName.length === 0 ||
    !Number.isFinite(normalizedTransactionFeePct) ||
    normalizedTransactionFeePct < 0
  ) {
    throw new Error("Invalid broker settings");
  }

  await setStoredItem(
    STORAGE_KEYS.brokerSettings,
    JSON.stringify({
      brokerName: normalizedBrokerName,
      transactionFeePct: normalizedTransactionFeePct,
    })
  );
}

export async function clearBrokerSettings(): Promise<void> {
  await removeStoredItem(STORAGE_KEYS.brokerSettings);
}
