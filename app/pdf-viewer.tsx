import AppBackIconButton from "@/components/ui/app-back-icon-button";
import { APP_COLORS } from "@/src/theme/colors";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/src/lib/navigation";
import { useColorScheme } from "nativewind";
import React from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

function normalizeExternalUrl(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim();
  if (trimmedUrl.length === 0) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("//")) {
    return `https:${trimmedUrl}`;
  }

  return `https://${trimmedUrl}`;
}

function buildEmbeddedViewerUrl(pdfUrl: string): string {
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(pdfUrl)}`;
}

export default function PdfViewerScreen() {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const searchParams = useLocalSearchParams<{
    url?: string | string[];
    title?: string | string[];
  }>();

  const rawUrl = Array.isArray(searchParams.url)
    ? searchParams.url[0]
    : searchParams.url;
  const rawTitle = Array.isArray(searchParams.title)
    ? searchParams.title[0]
    : searchParams.title;

  const normalizedPdfUrl = React.useMemo(
    () => normalizeExternalUrl(rawUrl ?? ""),
    [rawUrl]
  );
  const screenTitle = (rawTitle ?? "PDF Viewer").trim();

  const [useEmbeddedViewer, setUseEmbeddedViewer] = React.useState(
    Platform.OS === "android"
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setUseEmbeddedViewer(Platform.OS === "android");
    setIsLoading(true);
    setHasError(false);
  }, [normalizedPdfUrl]);

  const viewerSourceUrl = React.useMemo(() => {
    if (normalizedPdfUrl.length === 0) {
      return "";
    }

    if (useEmbeddedViewer) {
      return buildEmbeddedViewerUrl(normalizedPdfUrl);
    }

    return normalizedPdfUrl;
  }, [normalizedPdfUrl, useEmbeddedViewer]);

  const handleOpenExternally = React.useCallback(async () => {
    if (normalizedPdfUrl.length === 0) {
      return;
    }

    try {
      await Linking.openURL(normalizedPdfUrl);
    } catch {
      // Ignore open failures to avoid crashing this screen.
    }
  }, [normalizedPdfUrl]);

  const handleWebViewError = React.useCallback(() => {
    if (!useEmbeddedViewer) {
      setUseEmbeddedViewer(true);
      setHasError(false);
      return;
    }

    setHasError(true);
    setIsLoading(false);
  }, [useEmbeddedViewer]);

  const hasValidPdfUrl = normalizedPdfUrl.length > 0;

  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <View className="flex-row items-center justify-between px-5 pt-3">
        <AppBackIconButton onPress={() => router.back()} />

        <Text
          numberOfLines={1}
          className="max-w-[68%] text-center text-lg font-extrabold text-app-text dark:text-app-textDark"
        >
          {screenTitle}
        </Text>

        <View className="w-14" />
      </View>

      <View
        className="flex-1 px-4"
        style={{
          paddingTop: 10,
          paddingBottom: insets.bottom + 12,
        }}
      >
        {!hasValidPdfUrl ? (
          <View className="flex-1 items-center justify-center rounded-3xl bg-brand-white/90 p-6 dark:bg-brand-white/10">
            <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
              Invalid PDF URL
            </Text>
            <Text className="mt-2 text-center text-sm font-semibold text-app-text dark:text-app-textDark">
              Could not open this document. Please try from announcements again.
            </Text>
          </View>
        ) : hasError ? (
          <View className="flex-1 items-center justify-center rounded-3xl bg-brand-white/90 p-6 dark:bg-brand-white/10">
            <Text className="text-lg font-bold text-app-text dark:text-app-textDark">
              PDF Could Not Load
            </Text>
            <Text className="mt-2 text-center text-sm font-semibold text-app-text dark:text-app-textDark">
              The document could not be rendered in-app for this source.
            </Text>

            <View className="mt-5 w-full gap-2">
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  setHasError(false);
                  setIsLoading(true);
                  setUseEmbeddedViewer((currentValue) => !currentValue);
                }}
                className="rounded-xl bg-button-primary px-4 py-3 dark:bg-button-neutral"
              >
                <Text className="text-center text-sm font-bold text-brand-white dark:text-brand-purple">
                  Retry In App
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  void handleOpenExternally();
                }}
                className="rounded-xl bg-app-highlight px-4 py-3 dark:bg-app-highlightDark"
              >
                <Text className="text-center text-sm font-bold text-brand-white dark:text-brand-purple">
                  Open In Browser
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="flex-1 overflow-hidden rounded-3xl bg-brand-white/95 dark:bg-brand-white/10">
            <WebView
              source={{ uri: viewerSourceUrl }}
              originWhitelist={["*"]}
              startInLoadingState
              renderLoading={() => (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator
                    size="small"
                    color={isDarkMode ? APP_COLORS.brand.white : APP_COLORS.brand.purple}
                  />
                  <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
                    Loading PDF...
                  </Text>
                </View>
              )}
              onLoadStart={() => {
                setIsLoading(true);
              }}
              onLoadEnd={() => {
                setIsLoading(false);
              }}
              onError={handleWebViewError}
              allowsBackForwardNavigationGestures
            />

            {isLoading ? (
              <View className="absolute right-3 top-3 rounded-xl bg-brand-white/90 px-2 py-1 dark:bg-brand-white/15">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Loading
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
