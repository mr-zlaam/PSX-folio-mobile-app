import AppBackIconButton from "@/components/ui/app-back-icon-button";
import { AppSkeletonTextGroup } from "@/components/ui/app-skeleton";
import {
  getCachedPsxAnnouncements,
  getLatestPsxAnnouncements,
  getPsxAnnouncementSourceDefinition,
  getPsxAnnouncementSources,
  normalizePsxAnnouncementSourceKey,
  PsxAnnouncementItem,
  PsxAnnouncementSnapshot,
  PsxAnnouncementSourceKey,
} from "@/src/features/announcements/announcements-data";
import { registerAnnouncementItemsAsNotifications } from "@/src/features/notifications/in-app-notifications";
import { APP_COLORS } from "@/src/theme/colors";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/src/lib/navigation";
import { useColorScheme } from "nativewind";
import React from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const ANNOUNCEMENTS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function buildEmptySnapshot(
  sourceKey: PsxAnnouncementSourceKey,
): PsxAnnouncementSnapshot {
  const sourceDefinition = getPsxAnnouncementSourceDefinition(sourceKey);
  return {
    sourceKey,
    sourceLabel: sourceDefinition.label,
    asOf: null,
    items: [],
    source: "fallback",
  };
}

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return "--";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "--";
  }

  return parsedDate.toLocaleString("en-PK", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AnnouncementSourceRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className={[
        "flex-row items-center justify-between rounded-xl px-3 py-3",
        selected
          ? "bg-app-highlight dark:bg-app-highlightDark"
          : "bg-brand-white dark:bg-brand-white/10",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-sm font-semibold",
          selected
            ? "text-brand-white dark:text-brand-purple"
            : "text-app-text dark:text-app-textDark",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </Text>

      {selected ? (
        <MaterialCommunityIcons
          name="check-circle"
          size={18}
          color={APP_COLORS.success.green}
        />
      ) : null}
    </TouchableOpacity>
  );
}

export default function AnnouncementsScreen() {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchParams = useLocalSearchParams<{ source?: string | string[] }>();

  const initialSourceKey = React.useMemo(() => {
    const sourceParam = Array.isArray(searchParams.source)
      ? searchParams.source[0]
      : searchParams.source;

    return normalizePsxAnnouncementSourceKey(sourceParam);
  }, [searchParams.source]);

  const [selectedSourceKey, setSelectedSourceKey] =
    React.useState<PsxAnnouncementSourceKey>(initialSourceKey);
  const [snapshot, setSnapshot] = React.useState<PsxAnnouncementSnapshot>(() =>
    buildEmptySnapshot(initialSourceKey),
  );
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const sourceSheetRef = React.useRef<BottomSheetModal>(null);
  const sourceSheetSnapPoints = React.useMemo(() => ["68%"], []);
  const loadRequestIdRef = React.useRef(0);

  const selectedSourceDefinition = React.useMemo(
    () => getPsxAnnouncementSourceDefinition(selectedSourceKey),
    [selectedSourceKey],
  );

  const handleOpenSourcePicker = React.useCallback(() => {
    sourceSheetRef.current?.present();
  }, []);

  const handleCloseSourcePicker = React.useCallback(() => {
    sourceSheetRef.current?.dismiss();
  }, []);

  const sourceSheetBackdrop = React.useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  const handleOpenAnnouncement = React.useCallback(
    (item: PsxAnnouncementItem) => {
      if (item.pdfUrl) {
        router.push({
          pathname: "/pdf-viewer",
          params: {
            title: item.symbol ? `${item.symbol} Announcement` : "PSX Announcement",
            url: item.pdfUrl,
          },
        });
        return;
      }

      if (item.symbol) {
        router.push({
          pathname: "/stock-detail",
          params: {
            symbol: item.symbol,
            origin: "market",
          },
        });
      }
    },
    [router],
  );

  const loadAnnouncements = React.useCallback(
    async (showLoader = false) => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;

      if (showLoader) {
        setIsInitialLoading(true);
      }

      try {
        const cachedSnapshot = await getCachedPsxAnnouncements(selectedSourceKey);
        if (loadRequestIdRef.current !== requestId) {
          return;
        }

        if (cachedSnapshot) {
          setSnapshot(cachedSnapshot);
        } else {
          setSnapshot(buildEmptySnapshot(selectedSourceKey));
        }

        const latestSnapshot = await getLatestPsxAnnouncements(selectedSourceKey);
        if (loadRequestIdRef.current !== requestId) {
          return;
        }

        setSnapshot(latestSnapshot);
        void registerAnnouncementItemsAsNotifications(latestSnapshot.items);
      } finally {
        if (loadRequestIdRef.current === requestId && showLoader) {
          setIsInitialLoading(false);
        }
      }
    },
    [selectedSourceKey],
  );

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadAnnouncements();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadAnnouncements]);

  React.useEffect(() => {
    setSnapshot(buildEmptySnapshot(selectedSourceKey));
    void loadAnnouncements(true);

    const intervalId = setInterval(() => {
      void loadAnnouncements();
    }, ANNOUNCEMENTS_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadAnnouncements, selectedSourceKey]);

  React.useEffect(() => {
    const sourceParam = Array.isArray(searchParams.source)
      ? searchParams.source[0]
      : searchParams.source;
    const normalizedSourceKey = normalizePsxAnnouncementSourceKey(sourceParam);

    setSelectedSourceKey((currentSourceKey) => {
      if (currentSourceKey === normalizedSourceKey) {
        return currentSourceKey;
      }

      return normalizedSourceKey;
    });
  }, [searchParams.source]);

  const announcementItems = snapshot.items;

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

            <Text className="max-w-[62%] text-center text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Announcements
            </Text>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleOpenSourcePicker}
              className="h-10 w-14 items-center justify-center rounded-xl bg-brand-white/80 dark:bg-brand-white/10"
            >
              <MaterialCommunityIcons
                name="view-list"
                size={20}
                color={
                  isDarkMode ? APP_COLORS.app.highlightDark : APP_COLORS.app.highlight
                }
              />
            </TouchableOpacity>
          </View>

          <View className="rounded-3xl bg-brand-white px-4 py-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
            <Text className="text-xs font-bold uppercase tracking-wider text-app-highlight dark:text-app-highlightDark">
              {selectedSourceDefinition.label}
            </Text>
            <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
              {announcementItems.length} item{announcementItems.length === 1 ? "" : "s"}
            </Text>
            <Text className="mt-1 text-[11px] font-semibold text-text-light dark:text-text-dark">
              Updated {formatUpdatedAt(snapshot.asOf)}
            </Text>
          </View>

          {isInitialLoading ? (
            <View className="rounded-3xl bg-brand-white p-8 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <AppSkeletonTextGroup rows={5} rowHeight={12} />
            </View>
          ) : announcementItems.length === 0 ? (
            <View className="rounded-3xl bg-brand-white p-6 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10">
              <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                No announcements available for this source right now.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {announcementItems.map((item) => {
                const canOpen = Boolean(item.pdfUrl || item.symbol);
                const dateTimeText = [item.dateLabel, item.timeLabel ?? ""]
                  .filter((part) => part.trim().length > 0)
                  .join(" • ");

                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={canOpen ? 0.88 : 1}
                    onPress={canOpen ? () => handleOpenAnnouncement(item) : undefined}
                    disabled={!canOpen}
                    className="rounded-3xl bg-brand-white p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:border dark:border-app-highlightDark/25 dark:bg-brand-white/10"
                  >
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                        {dateTimeText.length > 0 ? dateTimeText : "No timestamp"}
                      </Text>

                      {item.symbol ? (
                        <View className="rounded-lg bg-app-highlight/10 px-2 py-1 dark:bg-brand-white/10">
                          <Text className="text-[11px] font-bold text-app-text dark:text-app-textDark">
                            {item.symbol}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text className="mt-2 text-base font-bold leading-6 text-app-text dark:text-app-textDark">
                      {item.title}
                    </Text>

                    {item.summary.trim().length > 0 ? (
                      <Text className="mt-1 text-sm font-semibold leading-5 text-app-text dark:text-app-textDark">
                        {item.summary}
                      </Text>
                    ) : null}

                    {item.pdfUrl ? (
                      <View className="mt-3 self-start rounded-xl bg-app-highlight px-3 py-2 dark:bg-app-highlightDark">
                        <Text className="text-xs font-bold uppercase tracking-wide text-brand-white dark:text-brand-purple">
                          View PDF
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <BottomSheetModal
        ref={sourceSheetRef}
        snapPoints={sourceSheetSnapPoints}
        enablePanDownToClose
        backdropComponent={sourceSheetBackdrop}
        backgroundStyle={{
          backgroundColor: isDarkMode
            ? APP_COLORS.brand.purple
            : APP_COLORS.brand.white,
        }}
        handleIndicatorStyle={{
          backgroundColor: isDarkMode
            ? APP_COLORS.brand.white
            : APP_COLORS.brand.purple,
        }}
      >
        <BottomSheetView
          style={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 16,
            paddingTop: 8,
          }}
        >
          <Text className="text-center text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
            Notice Types
          </Text>

          <View className="mt-3 gap-2">
            {getPsxAnnouncementSources().map((sourceDefinition) => (
              <AnnouncementSourceRow
                key={sourceDefinition.key}
                label={sourceDefinition.label}
                selected={sourceDefinition.key === selectedSourceKey}
                onPress={() => {
                  setSelectedSourceKey(sourceDefinition.key);
                  handleCloseSourcePicker();
                }}
              />
            ))}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
