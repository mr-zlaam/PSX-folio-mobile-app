import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import {
  getLatestPsxAnnouncements,
  PsxAnnouncementItem,
  PsxAnnouncementSourceKey,
} from "@/src/features/announcements/announcements-data";

const NOTIFICATION_STORAGE_KEY = "@psx-portfolio/in-app-notifications";
const NOTIFICATION_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const MAX_STORED_NOTIFICATIONS = 500;

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
  "agmEogmCalendar",
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
  agmEogmCalendar: 10,
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

function normalizeNotifications(
  notifications: InAppNotification[],
): InAppNotification[] {
  return [...notifications]
    .sort((firstItem, secondItem) => {
      const firstTime = firstItem.occurredAt
        ? new Date(firstItem.occurredAt).getTime()
        : new Date(firstItem.createdAt).getTime();
      const secondTime = secondItem.occurredAt
        ? new Date(secondItem.occurredAt).getTime()
        : new Date(secondItem.createdAt).getTime();

      if (firstTime === secondTime) {
        return secondItem.createdAt.localeCompare(firstItem.createdAt);
      }

      return secondTime - firstTime;
    })
    .slice(0, MAX_STORED_NOTIFICATIONS);
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
    occurredAt: item.occurredAt,
    createdAt,
    readAt: null,
  };
}

function appendAnnouncementNotifications(
  store: NotificationStore,
  announcementItems: PsxAnnouncementItem[],
): number {
  if (announcementItems.length === 0) {
    return 0;
  }

  const existingAnnouncementIds = new Set(
    store.notifications.map((notification) => notification.announcementId),
  );

  const newNotifications: InAppNotification[] = [];
  for (const announcementItem of announcementItems) {
    if (existingAnnouncementIds.has(announcementItem.id)) {
      continue;
    }

    newNotifications.push(buildNotificationFromAnnouncement(announcementItem));
    existingAnnouncementIds.add(announcementItem.id);
  }

  if (newNotifications.length === 0) {
    return 0;
  }

  store.notifications = normalizeNotifications([
    ...newNotifications,
    ...store.notifications,
  ]);
  return newNotifications.length;
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
  const createdCount = appendAnnouncementNotifications(store, announcementItems);

  if (createdCount <= 0) {
    return 0;
  }

  await writeStore(store);
  emitNotificationChange();
  return createdCount;
}

export async function syncPsxAnnouncementsToInAppNotifications(options?: {
  force?: boolean;
}): Promise<number> {
  const now = Date.now();
  if (
    !options?.force &&
    now - lastSyncTimestamp < NOTIFICATION_SYNC_INTERVAL_MS
  ) {
    return 0;
  }

  if (inFlightSyncPromise) {
    return inFlightSyncPromise;
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
    const createdCount = appendAnnouncementNotifications(store, announcementItems);
    store.lastSyncedAt = new Date().toISOString();
    await writeStore(store);

    if (createdCount > 0) {
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
