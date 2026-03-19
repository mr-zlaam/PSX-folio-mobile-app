import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export type AppTheme = "light" | "dark";

const STORAGE_KEYS = {
  onboardingComplete: "@psx-portfolio/onboarding-complete",
  themePreference: "@psx-portfolio/theme-preference",
} as const;

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
