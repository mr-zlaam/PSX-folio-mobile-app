import * as FileSystem from "expo-file-system/legacy";
import { emitDepositMutation } from "@/src/features/trade/trade-events";

export type DepositRecordInput = {
  amount: number;
  depositedAt: string;
  note: string | null;
};

export type DepositRecord = DepositRecordInput & {
  id: string;
  createdAt: string;
};

type DepositStore = {
  version: 1;
  records: DepositRecord[];
  updatedAt: string;
};

const DEPOSIT_STORE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-deposit-records.json`
  : null;

function toPositiveFiniteNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function buildDepositId(): string {
  return `deposit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getSafeStore(rawValue: unknown): DepositStore {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {
      version: 1,
      records: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const parsedStore = rawValue as Partial<DepositStore>;
  const rawRecords = Array.isArray(parsedStore.records) ? parsedStore.records : [];
  const validRecords = rawRecords.filter(
    (record): record is DepositRecord =>
      Boolean(record) &&
      typeof record.id === "string" &&
      typeof record.amount === "number" &&
      Number.isFinite(record.amount) &&
      typeof record.depositedAt === "string" &&
      (typeof record.note === "string" || record.note === null) &&
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

async function readStore(): Promise<DepositStore> {
  if (!DEPOSIT_STORE_FILE_URI) {
    return {
      version: 1,
      records: [],
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const rawStore = await FileSystem.readAsStringAsync(DEPOSIT_STORE_FILE_URI);
    return getSafeStore(JSON.parse(rawStore));
  } catch {
    return {
      version: 1,
      records: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeStore(store: DepositStore): Promise<void> {
  if (!DEPOSIT_STORE_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(DEPOSIT_STORE_FILE_URI, JSON.stringify(store));
}

export async function saveDepositRecord(
  input: DepositRecordInput
): Promise<DepositRecord> {
  const amount = toPositiveFiniteNumber(input.amount);
  if (amount === 0) {
    throw new Error("Invalid deposit input.");
  }

  const store = await readStore();
  const normalizedNote = input.note?.trim() ?? "";

  const record: DepositRecord = {
    id: buildDepositId(),
    amount,
    depositedAt: input.depositedAt,
    note: normalizedNote.length > 0 ? normalizedNote : null,
    createdAt: new Date().toISOString(),
  };

  const nextStore: DepositStore = {
    version: 1,
    records: [record, ...store.records],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(nextStore);
  emitDepositMutation({
    depositId: record.id,
    createdAt: record.createdAt,
  });

  return record;
}

export async function getDepositRecordById(
  depositId: string
): Promise<DepositRecord | null> {
  const normalizedDepositId = depositId.trim();
  if (normalizedDepositId.length === 0) {
    return null;
  }

  const store = await readStore();
  return store.records.find((record) => record.id === normalizedDepositId) ?? null;
}

export async function updateDepositRecord(
  depositId: string,
  input: DepositRecordInput
): Promise<DepositRecord> {
  const normalizedDepositId = depositId.trim();
  if (normalizedDepositId.length === 0) {
    throw new Error("Invalid deposit id.");
  }

  const amount = toPositiveFiniteNumber(input.amount);
  if (amount === 0) {
    throw new Error("Invalid deposit input.");
  }

  const store = await readStore();
  const existingRecordIndex = store.records.findIndex(
    (record) => record.id === normalizedDepositId
  );
  if (existingRecordIndex < 0) {
    throw new Error("Deposit record not found.");
  }

  const normalizedNote = input.note?.trim() ?? "";
  const existingRecord = store.records[existingRecordIndex];

  const updatedRecord: DepositRecord = {
    id: existingRecord.id,
    createdAt: existingRecord.createdAt,
    amount,
    depositedAt: input.depositedAt,
    note: normalizedNote.length > 0 ? normalizedNote : null,
  };

  const nextRecords = [...store.records];
  nextRecords[existingRecordIndex] = updatedRecord;

  const nextStore: DepositStore = {
    version: 1,
    records: nextRecords,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(nextStore);
  emitDepositMutation({
    depositId: updatedRecord.id,
    createdAt: new Date().toISOString(),
  });

  return updatedRecord;
}

export async function getSavedDepositRecords(): Promise<DepositRecord[]> {
  const store = await readStore();
  return store.records;
}

export async function getTotalDepositAmount(): Promise<number> {
  const records = await getSavedDepositRecords();
  return records.reduce((sum, record) => sum + toPositiveFiniteNumber(record.amount), 0);
}

export async function clearSavedDepositRecords(): Promise<void> {
  const clearedStore: DepositStore = {
    version: 1,
    records: [],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(clearedStore);
}
