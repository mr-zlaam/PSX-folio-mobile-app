import * as FileSystem from "expo-file-system/legacy";
import { emitBonusShareMutation } from "@/src/features/trade/trade-events";

export type BonusShareRecordInput = {
  symbol: string;
  units: number;
  awardedAt: string;
};

export type BonusShareRecord = BonusShareRecordInput & {
  id: string;
  createdAt: string;
};

type BonusShareStore = {
  version: 1;
  records: BonusShareRecord[];
  updatedAt: string;
};

const BONUS_SHARE_STORE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-bonus-share-records.json`
  : null;

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function toPositiveFiniteNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function buildBonusShareId(): string {
  return `bonus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getSafeStore(rawValue: unknown): BonusShareStore {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {
      version: 1,
      records: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const parsedStore = rawValue as Partial<BonusShareStore>;
  const rawRecords = Array.isArray(parsedStore.records) ? parsedStore.records : [];
  const validRecords = rawRecords.filter(
    (record): record is BonusShareRecord =>
      Boolean(record) &&
      typeof record.id === "string" &&
      typeof record.symbol === "string" &&
      typeof record.units === "number" &&
      Number.isFinite(record.units) &&
      typeof record.awardedAt === "string" &&
      typeof record.createdAt === "string"
  );

  return {
    version: 1,
    records: validRecords,
    updatedAt:
      typeof parsedStore.updatedAt === "string"
        ? parsedStore.updatedAt
        : new Date().toISOString(),
  };
}

async function readStore(): Promise<BonusShareStore> {
  if (!BONUS_SHARE_STORE_FILE_URI) {
    return {
      version: 1,
      records: [],
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const rawStore = await FileSystem.readAsStringAsync(BONUS_SHARE_STORE_FILE_URI);
    return getSafeStore(JSON.parse(rawStore));
  } catch {
    return {
      version: 1,
      records: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeStore(store: BonusShareStore): Promise<void> {
  if (!BONUS_SHARE_STORE_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(BONUS_SHARE_STORE_FILE_URI, JSON.stringify(store));
}

export async function saveBonusShareRecord(
  input: BonusShareRecordInput
): Promise<BonusShareRecord> {
  const normalizedSymbol = normalizeSymbol(input.symbol);
  const units = toPositiveFiniteNumber(input.units);
  if (normalizedSymbol.length === 0 || !Number.isInteger(units) || units === 0) {
    throw new Error("Invalid bonus share input.");
  }

  const store = await readStore();
  const record: BonusShareRecord = {
    id: buildBonusShareId(),
    symbol: normalizedSymbol,
    units,
    awardedAt: input.awardedAt,
    createdAt: new Date().toISOString(),
  };

  const nextStore: BonusShareStore = {
    version: 1,
    records: [record, ...store.records],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(nextStore);
  emitBonusShareMutation({
    bonusShareId: record.id,
    symbol: record.symbol,
    createdAt: record.createdAt,
  });

  return record;
}

export async function getSavedBonusShareRecords(): Promise<BonusShareRecord[]> {
  const store = await readStore();
  return store.records;
}

export async function clearSavedBonusShareRecords(): Promise<void> {
  const clearedStore: BonusShareStore = {
    version: 1,
    records: [],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(clearedStore);
}

export async function replaceSavedBonusShareRecords(
  records: BonusShareRecord[]
): Promise<void> {
  const normalizedStore = getSafeStore({
    version: 1,
    records,
    updatedAt: new Date().toISOString(),
  });

  await writeStore(normalizedStore);
}
