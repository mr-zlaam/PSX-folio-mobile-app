import AppBackIconButton from "@/components/ui/app-back-icon-button";
import { AppSkeletonTextGroup } from "@/components/ui/app-skeleton";
import {
  getInAppNotifications,
  InAppNotification,
  markInAppNotificationRead,
  subscribeToInAppNotifications,
} from "@/src/features/notifications/in-app-notifications";
import { APP_COLORS } from "@/src/theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/src/lib/navigation";
import { useColorScheme } from "nativewind";
import React from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type NoticeFact = {
  label: string;
  value: string;
};

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

function isIsoDateSegment(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isTimeSegment(value: string): boolean {
  return /^\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?$/i.test(value.trim());
}

function formatDateSegment(value: string): string {
  const trimmedValue = value.trim();
  if (!isIsoDateSegment(trimmedValue)) {
    return trimmedValue;
  }

  const parsedDate = new Date(`${trimmedValue}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return trimmedValue;
  }

  return parsedDate.toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function parseTitleParts(title: string): { topic: string; company: string | null } {
  const parts = title
    .split("•")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length <= 1) {
    return {
      topic: title.trim(),
      company: null,
    };
  }

  const [topic, ...companyParts] = parts;
  return {
    topic,
    company: companyParts.join(" • "),
  };
}

function buildAboutText(
  notification: InAppNotification,
  topic: string,
  company: string | null,
): string {
  const source = notification.sourceLabel.toLowerCase();
  const symbol = notification.symbol ? ` (${notification.symbol})` : "";
  if (company) {
    return `This is a ${topic.toLowerCase()} notice for ${company}${symbol} from ${source}.`;
  }

  return `This is a ${topic.toLowerCase()} notice from ${source}${symbol}.`;
}

function buildNoticeFacts(
  notification: InAppNotification,
  messageSegments: string[],
  topic: string,
  company: string | null,
): NoticeFact[] {
  const facts: NoticeFact[] = [];
  const sourceKey = notification.sourceKey;
  const occurredAtLabel = formatTimestamp(notification.occurredAt ?? notification.createdAt);

  facts.push({ label: "Category", value: notification.sourceLabel });
  facts.push({ label: "Type", value: topic });
  if (company) {
    facts.push({ label: "Company", value: company });
  }
  if (notification.symbol) {
    facts.push({ label: "Symbol", value: notification.symbol });
  }

  if (sourceKey === "agmEogmCalendar") {
    const venue = messageSegments.find(
      (segment) => !isIsoDateSegment(segment) && !isTimeSegment(segment),
    );
    const dateSegments = messageSegments.filter((segment) => isIsoDateSegment(segment));
    const time = messageSegments.find((segment) => isTimeSegment(segment));

    if (venue) {
      facts.push({ label: "Venue", value: venue });
    }
    if (dateSegments[0]) {
      facts.push({ label: "Period End", value: formatDateSegment(dateSegments[0]) });
    }
    if (dateSegments[1]) {
      facts.push({ label: "Meeting Date", value: formatDateSegment(dateSegments[1]) });
    }
    if (time) {
      facts.push({ label: "Meeting Time", value: time });
    }
  } else {
    const time = messageSegments.find((segment) => isTimeSegment(segment));
    const dateSegments = messageSegments.filter((segment) => isIsoDateSegment(segment));
    const summarySegments = messageSegments.filter(
      (segment) => !isIsoDateSegment(segment) && !isTimeSegment(segment),
    );

    if (summarySegments.length > 0) {
      facts.push({ label: "Summary", value: summarySegments.join(" • ") });
    }
    if (dateSegments.length > 0) {
      facts.push({
        label: "Notice Date",
        value: formatDateSegment(dateSegments[dateSegments.length - 1] ?? ""),
      });
    }
    if (time) {
      facts.push({ label: "Notice Time", value: time });
    }
  }

  facts.push({ label: "Updated", value: occurredAtLabel });
  return facts;
}

function FactRow({ label, value }: NoticeFact) {
  return (
    <View className="rounded-2xl bg-brand-white/70 px-3 py-2 dark:bg-brand-white/10">
      <Text className="text-[10px] font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
        {label}
      </Text>
      <Text className="mt-1 text-sm font-semibold leading-5 text-app-text dark:text-app-textDark">
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  isDarkMode,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  onPress: () => void;
  isDarkMode: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className="flex-row items-center justify-center gap-2 rounded-2xl border border-app-highlight/20 bg-app-highlight/8 px-4 py-3 dark:border-app-highlightDark/20 dark:bg-brand-white/10"
    >
      <MaterialCommunityIcons
        name={icon}
        size={16}
        color={isDarkMode ? APP_COLORS.app.highlightDark : APP_COLORS.app.highlight}
      />
      <Text className="text-sm font-bold text-app-highlight dark:text-app-highlightDark">
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function NotificationDetailScreen() {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchParams = useLocalSearchParams<{ id?: string | string[] }>();

  const notificationId = React.useMemo(() => {
    const idParam = Array.isArray(searchParams.id)
      ? searchParams.id[0]
      : searchParams.id;
    return typeof idParam === "string" && idParam.trim().length > 0
      ? idParam.trim()
      : null;
  }, [searchParams.id]);

  const [notification, setNotification] = React.useState<InAppNotification | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(true);

  const messageSegments = React.useMemo(() => {
    if (!notification) {
      return [];
    }

    return notification.message
      .split("•")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }, [notification]);

  const parsedTitle = React.useMemo(() => {
    if (!notification) {
      return {
        topic: "",
        company: null as string | null,
      };
    }

    return parseTitleParts(notification.title);
  }, [notification]);

  const aboutText = React.useMemo(() => {
    if (!notification) {
      return "";
    }

    return buildAboutText(
      notification,
      parsedTitle.topic,
      parsedTitle.company,
    );
  }, [notification, parsedTitle.company, parsedTitle.topic]);

  const noticeFacts = React.useMemo(() => {
    if (!notification) {
      return [];
    }

    return buildNoticeFacts(
      notification,
      messageSegments,
      parsedTitle.topic,
      parsedTitle.company,
    );
  }, [
    messageSegments,
    notification,
    parsedTitle.company,
    parsedTitle.topic,
  ]);

  const loadNotification = React.useCallback(async () => {
    if (!notificationId) {
      setNotification(null);
      return;
    }

    const notifications = await getInAppNotifications();
    const matchedNotification =
      notifications.find((item) => item.id === notificationId) ?? null;
    setNotification(matchedNotification);
  }, [notificationId]);

  React.useEffect(() => {
    let isMounted = true;

    async function hydrateNotification() {
      setIsLoading(true);
      await loadNotification();

      if (notificationId) {
        await markInAppNotificationRead(notificationId);
      }

      if (isMounted) {
        setIsLoading(false);
      }
    }

    void hydrateNotification();

    const unsubscribe = subscribeToInAppNotifications(() => {
      if (!isMounted) {
        return;
      }
      void loadNotification();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [loadNotification, notificationId]);

  const handleOpenStock = React.useCallback(() => {
    if (!notification?.symbol) {
      return;
    }

    router.push({
      pathname: "/stock-detail",
      params: {
        symbol: notification.symbol,
        origin: "market",
      },
    });
  }, [notification?.symbol, router]);

  const handleOpenPdf = React.useCallback(() => {
    if (!notification?.pdfUrl) {
      return;
    }

    router.push({
      pathname: "/pdf-viewer",
      params: {
        title: notification.symbol
          ? `${notification.symbol} Announcement`
          : "PSX Announcement",
        url: notification.pdfUrl,
      },
    });
  }, [notification?.pdfUrl, notification?.symbol, router]);

  const handleOpenSource = React.useCallback(() => {
    if (!notification) {
      return;
    }

    router.push({
      pathname: "/announcements",
      params: {
        source: notification.sourceKey,
      },
    });
  }, [notification, router]);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <View
        className="flex-1 px-5"
        style={{
          paddingTop: 14,
        }}
      >
        <View className="flex-row items-center justify-between">
          <AppBackIconButton onPress={() => router.back()} />

          <Text className="max-w-[60%] text-center text-2xl font-extrabold text-app-text dark:text-app-textDark">
            Notification
          </Text>

          <View className="w-14" />
        </View>

        <ScrollView
          className="mt-4 flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 18 }}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View className="rounded-3xl bg-brand-white p-8 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <AppSkeletonTextGroup rows={5} rowHeight={12} />
            </View>
          ) : !notification ? (
            <View className="items-center rounded-3xl bg-brand-white p-8 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <Text className="text-base font-bold text-app-text dark:text-app-textDark">
                Notification not found
              </Text>
              <Text className="mt-2 text-center text-sm font-semibold text-text-light dark:text-text-dark">
                It may have been removed after sync.
              </Text>
            </View>
          ) : (
            <View className="gap-4">
              <View className="rounded-3xl bg-brand-white p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-[11px] font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                      {notification.sourceLabel}
                    </Text>
                    <Text className="mt-1 text-lg font-bold leading-7 text-app-text dark:text-app-textDark">
                      {parsedTitle.topic}
                    </Text>
                    {parsedTitle.company ? (
                      <Text className="mt-1 text-sm font-semibold text-app-text dark:text-app-textDark">
                        {parsedTitle.company}
                      </Text>
                    ) : null}
                  </View>

                  {!notification.readAt ? (
                    <View className="mt-1 h-2.5 w-2.5 rounded-full bg-brand-red" />
                  ) : null}
                </View>

                <View className="mt-3 flex-row items-center gap-2">
                  <Text className="text-xs font-semibold text-text-light dark:text-text-dark">
                    {formatTimestamp(notification.occurredAt ?? notification.createdAt)}
                  </Text>
                  {notification.symbol ? (
                    <Text className="rounded-full bg-brand-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-white">
                      {notification.symbol}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                  What This Is About
                </Text>
                <Text className="mt-2 text-sm font-semibold leading-6 text-app-text dark:text-app-textDark">
                  {aboutText}
                </Text>
              </View>

              <View className="rounded-3xl bg-brand-white p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                  Key Details
                </Text>
                <View className="mt-3 gap-2">
                  {noticeFacts.map((fact) => (
                    <FactRow key={`${fact.label}-${fact.value}`} {...fact} />
                  ))}
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                  Original Notice Text
                </Text>
                <View className="mt-3 rounded-2xl bg-brand-white/70 p-4 dark:bg-brand-white/10">
                  {messageSegments.length <= 1 ? (
                    <Text className="text-sm font-semibold leading-6 text-app-text dark:text-app-textDark">
                      {notification.message}
                    </Text>
                  ) : (
                    <View className="gap-1.5">
                      {messageSegments.map((segment, segmentIndex) => (
                        <Text
                          key={`${segment}-${segmentIndex}`}
                          className="text-sm font-semibold leading-6 text-app-text dark:text-app-textDark"
                        >
                          {`\u2022 ${segment}`}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              <View className="rounded-3xl bg-brand-white p-5 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
                <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
                  Actions
                </Text>

                <View className="mt-3 gap-2">
                  <ActionButton
                    label="Open Source Feed"
                    icon="format-list-bulleted"
                    onPress={handleOpenSource}
                    isDarkMode={isDarkMode}
                  />

                  {notification.symbol ? (
                    <ActionButton
                      label="Open Stock Detail"
                      icon="chart-line"
                      onPress={handleOpenStock}
                      isDarkMode={isDarkMode}
                    />
                  ) : null}

                  {notification.pdfUrl ? (
                    <ActionButton
                      label="Open PDF"
                      icon="file-pdf-box"
                      onPress={handleOpenPdf}
                      isDarkMode={isDarkMode}
                    />
                  ) : null}
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
