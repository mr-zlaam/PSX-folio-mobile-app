import * as FileSystem from "expo-file-system/legacy";
import { emitDividendMutation } from "@/src/features/trade/trade-events";
import { TaxpayerProfile } from "@/src/lib/app-preferences";

export type DividendRecordInput = {
  symbol: string;
  shares: number;
  dividendPerShare: number;
  taxDeductionPct: number;
  taxDeductionAmount: number;
  zakatAmount: number;
  grossAmount: number;
  finalAmount: number;
  taxpayerProfile: TaxpayerProfile;
  dividendDate: string;
};

export type DividendRecord = DividendRecordInput & {
  id: string;
  createdAt: string;
};

type DividendStore = {
  version: 1;
  records: DividendRecord[];
  updatedAt: string;
};

const DIVIDEND_STORE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-dividend-records.json`
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

function toNonNegativeFiniteNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function buildDividendId(): string {
  return `dividend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getSafeStore(rawValue: unknown): DividendStore {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {
      version: 1,
      records: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const parsedStore = rawValue as Partial<DividendStore>;
  const rawRecords = Array.isArray(parsedStore.records) ? parsedStore.records : [];
  const validRecords = rawRecords.filter(
    (record): record is DividendRecord =>
      Boolean(record) &&
      typeof record.id === "string" &&
      typeof record.symbol === "string" &&
      typeof record.shares === "number" &&
      Number.isFinite(record.shares) &&
      typeof record.dividendPerShare === "number" &&
      Number.isFinite(record.dividendPerShare) &&
      typeof record.taxDeductionPct === "number" &&
      Number.isFinite(record.taxDeductionPct) &&
      typeof record.taxDeductionAmount === "number" &&
      Number.isFinite(record.taxDeductionAmount) &&
      typeof record.zakatAmount === "number" &&
      Number.isFinite(record.zakatAmount) &&
      typeof record.grossAmount === "number" &&
      Number.isFinite(record.grossAmount) &&
      typeof record.finalAmount === "number" &&
      Number.isFinite(record.finalAmount) &&
      (record.taxpayerProfile === "filer" || record.taxpayerProfile === "nonFiler") &&
      typeof record.dividendDate === "string" &&
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

async function readStore(): Promise<DividendStore> {
  if (!DIVIDEND_STORE_FILE_URI) {
    return {
      version: 1,
      records: [],
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const rawStore = await FileSystem.readAsStringAsync(DIVIDEND_STORE_FILE_URI);
    return getSafeStore(JSON.parse(rawStore));
  } catch {
    return {
      version: 1,
      records: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeStore(store: DividendStore): Promise<void> {
  if (!DIVIDEND_STORE_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(DIVIDEND_STORE_FILE_URI, JSON.stringify(store));
}

export async function saveDividendRecord(
  input: DividendRecordInput
): Promise<DividendRecord> {
  const normalizedSymbol = normalizeSymbol(input.symbol);
  const shares = toPositiveFiniteNumber(input.shares);
  const dividendPerShare = toPositiveFiniteNumber(input.dividendPerShare);
  const taxDeductionPct = toNonNegativeFiniteNumber(input.taxDeductionPct);
  const taxDeductionAmount = toNonNegativeFiniteNumber(input.taxDeductionAmount);
  const zakatAmount = toNonNegativeFiniteNumber(input.zakatAmount);
  const grossAmount = toPositiveFiniteNumber(input.grossAmount);
  const finalAmount = toPositiveFiniteNumber(input.finalAmount);

  if (
    normalizedSymbol.length === 0 ||
    shares === 0 ||
    !Number.isInteger(shares) ||
    dividendPerShare === 0 ||
    grossAmount === 0 ||
    finalAmount === 0
  ) {
    throw new Error("Invalid dividend record input.");
  }

  if (input.taxpayerProfile !== "filer" && input.taxpayerProfile !== "nonFiler") {
    throw new Error("Invalid taxpayer profile.");
  }

  const store = await readStore();
  const record: DividendRecord = {
    id: buildDividendId(),
    symbol: normalizedSymbol,
    shares,
    dividendPerShare,
    taxDeductionPct,
    taxDeductionAmount,
    zakatAmount,
    grossAmount,
    finalAmount,
    taxpayerProfile: input.taxpayerProfile,
    dividendDate: input.dividendDate,
    createdAt: new Date().toISOString(),
  };

  const nextStore: DividendStore = {
    version: 1,
    records: [record, ...store.records],
    updatedAt: new Date().toISOString(),
  };
  await writeStore(nextStore);
  emitDividendMutation({
    dividendId: record.id,
    symbol: record.symbol,
    createdAt: record.createdAt,
  });

  return record;
}

export async function getDividendRecordById(
  dividendId: string
): Promise<DividendRecord | null> {
  const normalizedDividendId = dividendId.trim();
  if (normalizedDividendId.length === 0) {
    return null;
  }

  const store = await readStore();
  return (
    store.records.find((record) => record.id === normalizedDividendId) ?? null
  );
}

export async function updateDividendRecord(
  dividendId: string,
  input: DividendRecordInput
): Promise<DividendRecord> {
  const normalizedDividendId = dividendId.trim();
  if (normalizedDividendId.length === 0) {
    throw new Error("Invalid dividend id.");
  }

  const normalizedSymbol = normalizeSymbol(input.symbol);
  const shares = toPositiveFiniteNumber(input.shares);
  const dividendPerShare = toPositiveFiniteNumber(input.dividendPerShare);
  const taxDeductionPct = toNonNegativeFiniteNumber(input.taxDeductionPct);
  const taxDeductionAmount = toNonNegativeFiniteNumber(input.taxDeductionAmount);
  const zakatAmount = toNonNegativeFiniteNumber(input.zakatAmount);
  const grossAmount = toPositiveFiniteNumber(input.grossAmount);
  const finalAmount = toPositiveFiniteNumber(input.finalAmount);

  if (
    normalizedSymbol.length === 0 ||
    shares === 0 ||
    !Number.isInteger(shares) ||
    dividendPerShare === 0 ||
    grossAmount === 0 ||
    finalAmount === 0
  ) {
    throw new Error("Invalid dividend record input.");
  }

  if (input.taxpayerProfile !== "filer" && input.taxpayerProfile !== "nonFiler") {
    throw new Error("Invalid taxpayer profile.");
  }

  const store = await readStore();
  const existingRecordIndex = store.records.findIndex(
    (record) => record.id === normalizedDividendId
  );
  if (existingRecordIndex < 0) {
    throw new Error("Dividend record not found.");
  }

  const existingRecord = store.records[existingRecordIndex];
  const updatedRecord: DividendRecord = {
    id: existingRecord.id,
    createdAt: existingRecord.createdAt,
    symbol: normalizedSymbol,
    shares,
    dividendPerShare,
    taxDeductionPct,
    taxDeductionAmount,
    zakatAmount,
    grossAmount,
    finalAmount,
    taxpayerProfile: input.taxpayerProfile,
    dividendDate: input.dividendDate,
  };

  const nextRecords = [...store.records];
  nextRecords[existingRecordIndex] = updatedRecord;

  const nextStore: DividendStore = {
    version: 1,
    records: nextRecords,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(nextStore);
  emitDividendMutation({
    dividendId: updatedRecord.id,
    symbol: updatedRecord.symbol,
    createdAt: new Date().toISOString(),
  });

  return updatedRecord;
}

export async function getSavedDividendRecords(): Promise<DividendRecord[]> {
  const store = await readStore();
  return store.records;
}

export async function getTotalDividendFinalAmount(): Promise<number> {
  const records = await getSavedDividendRecords();
  return records.reduce((sum, record) => sum + toPositiveFiniteNumber(record.finalAmount), 0);
}

export async function clearSavedDividendRecords(): Promise<void> {
  const clearedStore: DividendStore = {
    version: 1,
    records: [],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(clearedStore);
}
