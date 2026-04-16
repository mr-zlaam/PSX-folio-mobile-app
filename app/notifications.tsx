import AppBackIconButton from "@/components/ui/app-back-icon-button";
import {
  AppListScreenSkeleton,
  AppSkeletonBlock,
} from "@/components/ui/app-skeleton";
import { useGuardedRouter } from "@/src/lib/navigation";
import {
  IN_APP_NOTIFICATIONS_REVALIDATE_INTERVAL_MS,
  getInAppNotifications,
  InAppNotification,
  markAllInAppNotificationsRead,
  subscribeToInAppNotifications,
  syncPsxAnnouncementsToInAppNotifications,
} from "@/src/features/notifications/in-app-notifications";
import { APP_COLORS } from "@/src/theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useColorScheme } from "nativewind";
import React from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const NOTIFICATIONS_REFRESH_INTERVAL_MS =
  IN_APP_NOTIFICATIONS_REVALIDATE_INTERVAL_MS;
const NOTIFICATIONS_PAGE_SIZE = 20;

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "--";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "--";
  }

  return parsedDate.toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNotificationSortTimestamp(notification: InAppNotification): number {
  const primaryTimestamp = new Date(
    notification.occurredAt ?? notification.createdAt,
  ).getTime();
  if (Number.isFinite(primaryTimestamp)) {
    return primaryTimestamp;
  }

  const createdAtTimestamp = new Date(notification.createdAt).getTime();
  if (Number.isFinite(createdAtTimestamp)) {
    return createdAtTimestamp;
  }

  return 0;
}

export default function NotificationsScreen() {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  const [notifications, setNotifications] = React.useState<InAppNotification[]>([]);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [visibleUnreadCount, setVisibleUnreadCount] = React.useState(
    NOTIFICATIONS_PAGE_SIZE,
  );
  const [visibleReadCount, setVisibleReadCount] = React.useState(
    NOTIFICATIONS_PAGE_SIZE,
  );

  const loadNotifications = React.useCallback(async () => {
    const storedNotifications = await getInAppNotifications();
    setNotifications(storedNotifications);
    return storedNotifications;
  }, []);

  const syncNotifications = React.useCallback(
    async (force = false) => {
      await syncPsxAnnouncementsToInAppNotifications({ force });
      await loadNotifications();
    },
    [loadNotifications],
  );

  React.useEffect(() => {
    let isMounted = true;

    async function hydrateNotifications() {
      try {
        setVisibleUnreadCount(NOTIFICATIONS_PAGE_SIZE);
        setVisibleReadCount(NOTIFICATIONS_PAGE_SIZE);
        const cachedNotifications = await loadNotifications();
        if (!isMounted) {
          return;
        }

        if (cachedNotifications.length > 0) {
          setIsInitialLoading(false);
          void syncNotifications(false);
          return;
        }

        await syncNotifications(true);
      } finally {
        if (isMounted) {
          setIsInitialLoading(false);
        }
      }
    }

    void hydrateNotifications();

    const unsubscribe = subscribeToInAppNotifications(() => {
      void loadNotifications();
    });

    const intervalId = setInterval(() => {
      void syncNotifications();
    }, NOTIFICATIONS_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [loadNotifications, syncNotifications]);

  const unreadCount = React.useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications],
  );

  const unreadNotifications = React.useMemo(
    () => notifications.filter((notification) => !notification.readAt),
    [notifications],
  );

  const readNotifications = React.useMemo(
    () =>
      notifications
        .filter((notification) => Boolean(notification.readAt))
        .sort((firstNotification, secondNotification) => {
          const firstTimestamp = getNotificationSortTimestamp(firstNotification);
          const secondTimestamp = getNotificationSortTimestamp(secondNotification);

          if (firstTimestamp !== secondTimestamp) {
            return secondTimestamp - firstTimestamp;
          }

          return secondNotification.createdAt.localeCompare(
            firstNotification.createdAt,
          );
        }),
    [notifications],
  );

  const visibleUnreadNotifications = React.useMemo(
    () => unreadNotifications.slice(0, visibleUnreadCount),
    [unreadNotifications, visibleUnreadCount],
  );

  const visibleReadNotifications = React.useMemo(
    () => readNotifications.slice(0, visibleReadCount),
    [readNotifications, visibleReadCount],
  );

  const hasMoreUnread = visibleUnreadNotifications.length < unreadNotifications.length;
  const hasMoreRead = visibleReadNotifications.length < readNotifications.length;

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);

    try {
      setVisibleUnreadCount(NOTIFICATIONS_PAGE_SIZE);
      setVisibleReadCount(NOTIFICATIONS_PAGE_SIZE);
      await syncNotifications(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [syncNotifications]);

  const handleMarkAllAsRead = React.useCallback(async () => {
    await markAllInAppNotificationsRead();
    await loadNotifications();
  }, [loadNotifications]);

  const handleOpenNotification = React.useCallback(
    async (notification: InAppNotification) => {
      router.push({
        pathname: "/notification-detail",
        params: {
          id: notification.id,
        },
      });
    },
    [router],
  );

  const loadingSkeletonMinHeight = React.useMemo(
    () => Math.max(520, windowHeight - insets.top - insets.bottom - 120),
    [insets.bottom, insets.top, windowHeight],
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
            colors={[isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple]}
            progressBackgroundColor={
              isDarkMode ? APP_COLORS.brand.purple : APP_COLORS.brand.white
            }
          />
        }
      >
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <AppBackIconButton onPress={() => router.back()} />

            <Text className="max-w-[52%] text-center text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Notifications
            </Text>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => {
                void handleMarkAllAsRead();
              }}
              disabled={unreadCount <= 0}
              className={[
                "rounded-xl px-3 py-2",
                unreadCount > 0
                  ? "bg-app-highlight dark:bg-app-highlightDark"
                  : "bg-brand-white/80 dark:bg-brand-white/10",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <Text
                className={[
                  "text-[11px] font-bold uppercase tracking-wide",
                  unreadCount > 0
                    ? "text-brand-white dark:text-brand-purple"
                    : "text-text-light dark:text-text-dark",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {`Read All (${unreadCount})`}
              </Text>
            </TouchableOpacity>
          </View>

          {isInitialLoading ? (
            <View style={{ minHeight: loadingSkeletonMinHeight }} className="gap-3">
              <View className="rounded-3xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <View className="flex-row items-center justify-between">
                  <AppSkeletonBlock width="26%" height={12} borderRadius={7} />
                  <AppSkeletonBlock width={40} height={20} borderRadius={10} />
                </View>
                <AppSkeletonBlock
                  className="mt-3"
                  width="62%"
                  height={12}
                  borderRadius={7}
                />
              </View>
              <AppListScreenSkeleton cardCount={5} />
            </View>
          ) : notifications.length === 0 ? (
            <View className="items-center rounded-3xl bg-brand-white p-6 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <MaterialCommunityIcons
                name="bell-off-outline"
                size={26}
                color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
              />
              <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                No notifications yet.
              </Text>
            </View>
          ) : (
            <View className="gap-5">
              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                    Unread
                  </Text>
                  <View className="rounded-lg bg-brand-red px-2 py-1">
                    <Text className="text-[11px] font-bold text-brand-white">
                      {unreadNotifications.length}
                    </Text>
                  </View>
                </View>

                {visibleUnreadNotifications.length === 0 ? (
                  <View className="items-center rounded-3xl bg-brand-white p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      No unread notifications.
                    </Text>
                  </View>
                ) : (
                  visibleUnreadNotifications.map((notification) => {
                    const occurredAt = notification.occurredAt ?? notification.createdAt;
                    return (
                      <TouchableOpacity
                        key={notification.id}
                        activeOpacity={0.88}
                        onPress={() => {
                          void handleOpenNotification(notification);
                        }}
                        className="rounded-3xl border border-brand-red/30 bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border-brand-red/40 dark:bg-brand-white/10"
                      >
                        <View className="flex-row items-start justify-between gap-3">
                          <View className="flex-1">
                            <Text
                              numberOfLines={2}
                              className="text-base font-bold leading-6 text-app-text dark:text-app-textDark"
                            >
                              {notification.title}
                            </Text>
                            <Text
                              numberOfLines={3}
                              className="mt-1 text-sm font-semibold leading-5 text-app-text dark:text-app-textDark"
                            >
                              {notification.message}
                            </Text>
                          </View>

                          <View className="h-2.5 w-2.5 rounded-full bg-brand-red" />
                        </View>

                        <View className="mt-3 gap-1">
                          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                            {notification.sourceLabel}
                          </Text>
                          <Text className="text-[11px] font-semibold text-text-light dark:text-text-dark">
                            {formatTimestamp(occurredAt)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}

                {hasMoreUnread ? (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => {
                      setVisibleUnreadCount((current) => {
                        return current + NOTIFICATIONS_PAGE_SIZE;
                      });
                    }}
                    className="self-center rounded-xl bg-brand-white/80 px-3 py-2 dark:bg-brand-white/10"
                  >
                    <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                      Load More Unread
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                    Read
                  </Text>
                  <View className="rounded-lg bg-brand-white/80 px-2 py-1 dark:bg-brand-white/10">
                    <Text className="text-[11px] font-bold text-text-light dark:text-text-dark">
                      {readNotifications.length}
                    </Text>
                  </View>
                </View>

                {visibleReadNotifications.length === 0 ? (
                  <View className="items-center rounded-3xl bg-brand-white p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                    <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                      No read notifications yet.
                    </Text>
                  </View>
                ) : (
                  visibleReadNotifications.map((notification) => {
                    const occurredAt = notification.occurredAt ?? notification.createdAt;
                    return (
                      <TouchableOpacity
                        key={notification.id}
                        activeOpacity={0.88}
                        onPress={() => {
                          void handleOpenNotification(notification);
                        }}
                        className="rounded-3xl border border-zinc-300/80 bg-zinc-100 p-4 shadow-sm shadow-zinc-300/60 dark:shadow-none dark:border-zinc-700/60 dark:bg-zinc-900/50"
                      >
                        <View className="flex-row items-start justify-between gap-3">
                          <View className="flex-1">
                            <Text
                              numberOfLines={2}
                              className="text-base font-bold leading-6 text-zinc-700 dark:text-zinc-300"
                            >
                              {notification.title}
                            </Text>
                            <Text
                              numberOfLines={3}
                              className="mt-1 text-sm font-semibold leading-5 text-zinc-600 dark:text-zinc-400"
                            >
                              {notification.message}
                            </Text>
                          </View>
                        </View>

                        <View className="mt-3 gap-1">
                          <Text className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            {notification.sourceLabel}
                          </Text>
                          <Text className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {formatTimestamp(occurredAt)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}

                {hasMoreRead ? (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => {
                      setVisibleReadCount((current) => {
                        return current + NOTIFICATIONS_PAGE_SIZE;
                      });
                    }}
                    className="self-center rounded-xl bg-brand-white/80 px-3 py-2 dark:bg-brand-white/10"
                  >
                    <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                      Load More Read
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
