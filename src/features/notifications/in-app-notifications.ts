import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import {
  getLatestPsxAnnouncements,
  PsxAnnouncementItem,
  PsxAnnouncementSourceKey,
} from "@/src/features/announcements/announcements-data";

const NOTIFICATION_STORAGE_KEY = "@psx-portfolio/in-app-notifications";
export const IN_APP_NOTIFICATIONS_REVALIDATE_INTERVAL_MS = 15 * 60 * 1000;

type NotificationStore = {
  version: 1;
  lastSyncedAt: string | null;
  notifications: InAppNotification[];
};

export type InAppNotification = {
  id: string;
  announcementId: string;
  sourceKey: PsxAnnouncementSourceKey;
  sourceLabel: string;
  title: string;
  message: string;
  symbol: string | null;
  pdfUrl: string | null;
  occurredAt: string | null;
  createdAt: string;
  readAt: string | null;
};

const NOTIFICATION_SOURCE_KEYS: PsxAnnouncementSourceKey[] = [
  "psxNotices",
  "companyAnnouncements",
  "corporateBriefingSessions",
  "cdcNotices",
  "secpNotices",
  "nccplNotices",
  "payouts",
  "gisAuctionResults",
];

const NOTIFICATION_FETCH_COUNT_BY_SOURCE: Partial<
  Record<PsxAnnouncementSourceKey, number>
> = {
  psxNotices: 8,
  companyAnnouncements: 8,
  corporateBriefingSessions: 6,
  cdcNotices: 5,
  secpNotices: 5,
  nccplNotices: 5,
  payouts: 8,
  gisAuctionResults: 5,
};

const NOTIFICATIONS_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}psx-in-app-notifications.json`
  : null;

let isAsyncStorageAvailable: boolean | null = null;
let lastSyncTimestamp = 0;
let inFlightSyncPromise: Promise<number> | null = null;

type InAppNotificationListener = () => void;

const notificationListeners = new Set<InAppNotificationListener>();

const MONTH_INDEX_BY_NAME: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseTimeParts(timeText: string | null | undefined): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  const normalized = (timeText ?? "").trim().toLowerCase();
  if (normalized.length === 0) {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  const timeMatch = normalized.match(
    /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/,
  );
  if (!timeMatch) {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  let hours = Number(timeMatch[1] ?? "0");
  const minutes = Number(timeMatch[2] ?? "0");
  const seconds = Number(timeMatch[3] ?? "0");
  const meridiem = timeMatch[4] ?? "";

  if (meridiem === "pm" && hours < 12) {
    hours += 12;
  } else if (meridiem === "am" && hours === 12) {
    hours = 0;
  }

  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
    seconds: Number.isFinite(seconds) ? seconds : 0,
  };
}

function buildIsoFromDateParts(
  year: number,
  month: number,
  day: number,
  timeText?: string | null,
): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 0 || month > 11 || day <= 0 || day > 31) {
    return null;
  }

  const { hours, minutes, seconds } = parseTimeParts(timeText);
  const parsedDate = new Date(year, month, day, hours, minutes, seconds);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function parseFlexibleDateToIso(
  dateText: string,
  timeText?: string | null,
): string | null {
  const normalizedDate = dateText.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (normalizedDate.length === 0) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    const parsedIso = new Date(
      `${normalizedDate}T${(timeText ?? "").trim().length > 0 ? (timeText ?? "").trim() : "00:00:00"}`,
    );
    if (!Number.isNaN(parsedIso.getTime())) {
      return parsedIso.toISOString();
    }
  }

  const ddMmYyyyMatch = normalizedDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (ddMmYyyyMatch) {
    const day = Number(ddMmYyyyMatch[1]);
    const month = Number(ddMmYyyyMatch[2]) - 1;
    let year = Number(ddMmYyyyMatch[3]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    return buildIsoFromDateParts(year, month, day, timeText);
  }

  const ddMmmYyyyMatch = normalizedDate.match(
    /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})$/,
  );
  if (ddMmmYyyyMatch) {
    const day = Number(ddMmmYyyyMatch[1]);
    const monthName = ddMmmYyyyMatch[2].slice(0, 3).toLowerCase();
    const month = MONTH_INDEX_BY_NAME[monthName];
    let year = Number(ddMmmYyyyMatch[3]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    if (typeof month === "number") {
      return buildIsoFromDateParts(year, month, day, timeText);
    }
  }

  const mmmDdYyyyMatch = normalizedDate.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{2,4})$/,
  );
  if (mmmDdYyyyMatch) {
    const monthName = mmmDdYyyyMatch[1].slice(0, 3).toLowerCase();
    const day = Number(mmmDdYyyyMatch[2]);
    let year = Number(mmmDdYyyyMatch[3]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    const month = MONTH_INDEX_BY_NAME[monthName];
    if (typeof month === "number") {
      return buildIsoFromDateParts(year, month, day, timeText);
    }
  }

  const parsedFallback = new Date(
    `${normalizedDate}${(timeText ?? "").trim().length > 0 ? ` ${(timeText ?? "").trim()}` : ""}`,
  );
  if (Number.isNaN(parsedFallback.getTime())) {
    return null;
  }

  return parsedFallback.toISOString();
}

function inferOccurredAtFromMessage(message: string): string | null {
  const segments = message
    .split("•")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return null;
  }

  const lastSegment = segments[segments.length - 1] ?? "";
  const secondLastSegment = segments[segments.length - 2] ?? "";

  const dateWithTimeIso = parseFlexibleDateToIso(secondLastSegment, lastSegment);
  if (dateWithTimeIso) {
    return dateWithTimeIso;
  }

  const dateOnlyIso = parseFlexibleDateToIso(lastSegment);
  if (dateOnlyIso) {
    return dateOnlyIso;
  }

  return null;
}

function getSortTimestamp(notification: InAppNotification): number {
  const primaryOccurredAt =
    notification.occurredAt ?? inferOccurredAtFromMessage(notification.message);
  if (primaryOccurredAt) {
    const parsed = new Date(primaryOccurredAt).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const createdAt = new Date(notification.createdAt).getTime();
  if (Number.isNaN(createdAt)) {
    return 0;
  }

  return createdAt;
}

function getNormalizedOccurredAt(notification: InAppNotification): string | null {
  if (notification.occurredAt) {
    const parsed = new Date(notification.occurredAt).getTime();
    if (!Number.isNaN(parsed)) {
      return notification.occurredAt;
    }
  }

  return inferOccurredAtFromMessage(notification.message);
}

function getOccurredAtFromAnnouncementItem(
  announcementItem: PsxAnnouncementItem,
): string | null {
  if (announcementItem.occurredAt) {
    const parsed = new Date(announcementItem.occurredAt).getTime();
    if (!Number.isNaN(parsed)) {
      return announcementItem.occurredAt;
    }
  }

  return parseFlexibleDateToIso(
    announcementItem.dateLabel,
    announcementItem.timeLabel,
  );
}

function normalizeNotifications(
  notifications: InAppNotification[],
): InAppNotification[] {
  const normalizedNotifications = notifications.map((notification) => {
    const normalizedOccurredAt = getNormalizedOccurredAt(notification);
    if (normalizedOccurredAt === notification.occurredAt) {
      return notification;
    }

    return {
      ...notification,
      occurredAt: normalizedOccurredAt,
    };
  });

  return [...normalizedNotifications]
    .sort((firstItem, secondItem) => {
      const firstTime = getSortTimestamp(firstItem);
      const secondTime = getSortTimestamp(secondItem);

      if (firstTime === secondTime) {
        return secondItem.createdAt.localeCompare(firstItem.createdAt);
      }

      return secondTime - firstTime;
    });
}

function getStoreSyncTimestamp(lastSyncedAt: string | null): number {
  if (!lastSyncedAt || lastSyncedAt.trim().length === 0) {
    return 0;
  }

  const parsed = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return 0;
  }

  return parsed;
}

function buildNotificationMessage(item: PsxAnnouncementItem): string {
  const datePart = item.dateLabel.trim();
  const timePart = item.timeLabel?.trim() ?? "";
  const summaryPart = item.summary.trim();

  const dateTime = [datePart, timePart].filter((part) => part.length > 0).join(" • ");
  if (summaryPart.length > 0 && dateTime.length > 0) {
    return `${summaryPart} • ${dateTime}`;
  }

  if (summaryPart.length > 0) {
    return summaryPart;
  }

  return dateTime.length > 0 ? dateTime : item.sourceLabel;
}

function buildNotificationFromAnnouncement(
  item: PsxAnnouncementItem,
): InAppNotification {
  const createdAt = new Date().toISOString();

  return {
    id: `notif-${item.id}`,
    announcementId: item.id,
    sourceKey: item.sourceKey,
    sourceLabel: item.sourceLabel,
    title: item.title,
    message: buildNotificationMessage(item),
    symbol: item.symbol,
    pdfUrl: item.pdfUrl,
    occurredAt: getOccurredAtFromAnnouncementItem(item),
    createdAt,
    readAt: null,
  };
}

function appendAnnouncementNotifications(
  store: NotificationStore,
  announcementItems: PsxAnnouncementItem[],
): {
  createdCount: number;
  updatedCount: number;
} {
  if (announcementItems.length === 0) {
    return {
      createdCount: 0,
      updatedCount: 0,
    };
  }

  const existingNotificationIndexByAnnouncementId = new Map(
    store.notifications.map((notification, index) => [
      notification.announcementId,
      index,
    ]),
  );

  const newNotifications: InAppNotification[] = [];
  let updatedCount = 0;
  for (const announcementItem of announcementItems) {
    const existingNotificationIndex = existingNotificationIndexByAnnouncementId.get(
      announcementItem.id,
    );
    if (typeof existingNotificationIndex === "number") {
      const existingNotification = store.notifications[existingNotificationIndex];
      if (!existingNotification) {
        continue;
      }

      const updatedOccurredAt = getOccurredAtFromAnnouncementItem(announcementItem);
      const updatedMessage = buildNotificationMessage(announcementItem);
      const shouldUpdate =
        existingNotification.title !== announcementItem.title ||
        existingNotification.message !== updatedMessage ||
        existingNotification.sourceLabel !== announcementItem.sourceLabel ||
        existingNotification.symbol !== announcementItem.symbol ||
        existingNotification.pdfUrl !== announcementItem.pdfUrl ||
        (updatedOccurredAt !== null &&
          existingNotification.occurredAt !== updatedOccurredAt);

      if (shouldUpdate) {
        store.notifications[existingNotificationIndex] = {
          ...existingNotification,
          sourceLabel: announcementItem.sourceLabel,
          title: announcementItem.title,
          message: updatedMessage,
          symbol: announcementItem.symbol,
          pdfUrl: announcementItem.pdfUrl,
          occurredAt: updatedOccurredAt ?? existingNotification.occurredAt,
        };
        updatedCount += 1;
      }

      continue;
    }

    newNotifications.push(buildNotificationFromAnnouncement(announcementItem));
    existingNotificationIndexByAnnouncementId.set(
      announcementItem.id,
      store.notifications.length + newNotifications.length - 1,
    );
  }

  if (newNotifications.length === 0 && updatedCount === 0) {
    return {
      createdCount: 0,
      updatedCount: 0,
    };
  }

  store.notifications = normalizeNotifications([
    ...newNotifications,
    ...store.notifications,
  ]);
  return {
    createdCount: newNotifications.length,
    updatedCount,
  };
}

function emitNotificationChange(): void {
  for (const listener of notificationListeners) {
    try {
      listener();
    } catch {
      // Keep all listeners alive even if one listener fails.
    }
  }
}

async function readFromFileStore(): Promise<NotificationStore> {
  if (!NOTIFICATIONS_FILE_URI) {
    return {
      version: 1,
      lastSyncedAt: null,
      notifications: [],
    };
  }

  try {
    const storedRaw = await FileSystem.readAsStringAsync(NOTIFICATIONS_FILE_URI);
    const parsed = JSON.parse(storedRaw) as Partial<NotificationStore>;

    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.notifications)
    ) {
      return {
        version: 1,
        lastSyncedAt: null,
        notifications: [],
      };
    }

    return {
      version: 1,
      lastSyncedAt:
        typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
      notifications: parsed.notifications,
    };
  } catch {
    return {
      version: 1,
      lastSyncedAt: null,
      notifications: [],
    };
  }
}

async function writeToFileStore(store: NotificationStore): Promise<void> {
  if (!NOTIFICATIONS_FILE_URI) {
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(
      NOTIFICATIONS_FILE_URI,
      JSON.stringify(store),
    );
  } catch {
    // Ignore write failures to keep app responsive.
  }
}

async function readStore(): Promise<NotificationStore> {
  if (isAsyncStorageAvailable === false) {
    return readFromFileStore();
  }

  try {
    const storedRaw = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY);
    isAsyncStorageAvailable = true;

    if (!storedRaw) {
      return {
        version: 1,
        lastSyncedAt: null,
        notifications: [],
      };
    }

    const parsed = JSON.parse(storedRaw) as Partial<NotificationStore>;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.notifications)
    ) {
      return {
        version: 1,
        lastSyncedAt: null,
        notifications: [],
      };
    }

    return {
      version: 1,
      lastSyncedAt:
        typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
      notifications: parsed.notifications,
    };
  } catch {
    isAsyncStorageAvailable = false;
    return readFromFileStore();
  }
}

async function writeStore(store: NotificationStore): Promise<void> {
  if (isAsyncStorageAvailable !== false) {
    try {
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(store));
      isAsyncStorageAvailable = true;
      return;
    } catch {
      isAsyncStorageAvailable = false;
    }
  }

  await writeToFileStore(store);
}

export function subscribeToInAppNotifications(
  listener: InAppNotificationListener,
): () => void {
  notificationListeners.add(listener);

  return () => {
    notificationListeners.delete(listener);
  };
}

export async function getInAppNotifications(): Promise<InAppNotification[]> {
  const store = await readStore();
  return normalizeNotifications(store.notifications);
}

export async function getUnreadInAppNotificationCount(): Promise<number> {
  const notifications = await getInAppNotifications();
  return notifications.filter((notification) => !notification.readAt).length;
}

export async function markInAppNotificationRead(
  notificationId: string,
): Promise<void> {
  const store = await readStore();
  const readAt = new Date().toISOString();

  let didUpdate = false;
  store.notifications = store.notifications.map((notification) => {
    if (notification.id !== notificationId || notification.readAt) {
      return notification;
    }

    didUpdate = true;
    return {
      ...notification,
      readAt,
    };
  });

  if (!didUpdate) {
    return;
  }

  await writeStore(store);
  emitNotificationChange();
}

export async function markAllInAppNotificationsRead(): Promise<void> {
  const store = await readStore();
  const readAt = new Date().toISOString();
  let didUpdate = false;

  store.notifications = store.notifications.map((notification) => {
    if (notification.readAt) {
      return notification;
    }

    didUpdate = true;
    return {
      ...notification,
      readAt,
    };
  });

  if (!didUpdate) {
    return;
  }

  await writeStore(store);
  emitNotificationChange();
}

export async function registerAnnouncementItemsAsNotifications(
  announcementItems: PsxAnnouncementItem[],
): Promise<number> {
  if (announcementItems.length === 0) {
    return 0;
  }

  const store = await readStore();
  const { createdCount, updatedCount } = appendAnnouncementNotifications(
    store,
    announcementItems,
  );

  if (createdCount <= 0 && updatedCount <= 0) {
    return 0;
  }

  await writeStore(store);
  emitNotificationChange();
  return createdCount;
}

export async function syncPsxAnnouncementsToInAppNotifications(options?: {
  force?: boolean;
}): Promise<number> {
  if (inFlightSyncPromise) {
    return inFlightSyncPromise;
  }

  const now = Date.now();
  if (!options?.force) {
    const store = await readStore();
    const storeSyncTimestamp = getStoreSyncTimestamp(store.lastSyncedAt);
    const isStoreFresh =
      storeSyncTimestamp > 0 &&
      now - storeSyncTimestamp < IN_APP_NOTIFICATIONS_REVALIDATE_INTERVAL_MS;
    const isMemoryFresh =
      lastSyncTimestamp > 0 &&
      now - lastSyncTimestamp < IN_APP_NOTIFICATIONS_REVALIDATE_INTERVAL_MS;

    if (isStoreFresh || isMemoryFresh) {
      return 0;
    }
  }

  lastSyncTimestamp = now;

  inFlightSyncPromise = (async () => {
    const snapshots = await Promise.all(
      NOTIFICATION_SOURCE_KEYS.map((sourceKey) =>
        getLatestPsxAnnouncements(sourceKey, {
          count: NOTIFICATION_FETCH_COUNT_BY_SOURCE[sourceKey] ?? 8,
        }),
      ),
    );

    const announcementItems = snapshots.flatMap((snapshot) => snapshot.items);
    const store = await readStore();
    const { createdCount, updatedCount } = appendAnnouncementNotifications(
      store,
      announcementItems,
    );
    store.lastSyncedAt = new Date().toISOString();
    await writeStore(store);

    if (createdCount > 0 || updatedCount > 0) {
      emitNotificationChange();
    }

    return createdCount;
  })()
    .catch(() => 0)
    .finally(() => {
      inFlightSyncPromise = null;
    });

  return inFlightSyncPromise;
}

export async function getInAppNotificationsLastSyncedAt(): Promise<string | null> {
  const store = await readStore();
  return store.lastSyncedAt;
}
