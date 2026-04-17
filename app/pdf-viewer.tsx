import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppButton from "@/components/ui/app-button";
import { AppSkeletonTextGroup } from "@/components/ui/app-skeleton";
import { useGuardedRouter } from "@/src/lib/navigation";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const PSX_BASE_URL = "https://dps.psx.com.pk";
const PDF_ATTEMPT_TIMEOUT_MS = 22000;

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

  if (trimmedUrl.startsWith("/")) {
    return `${PSX_BASE_URL}${trimmedUrl}`;
  }

  if (trimmedUrl.startsWith("./")) {
    return `${PSX_BASE_URL}/${trimmedUrl.slice(2)}`;
  }

  return `https://${trimmedUrl}`;
}

function appendCacheBuster(url: string, cacheToken: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}cb=${cacheToken}`;
}

function buildGoogleViewerUrl(pdfUrl: string, cacheToken: number): string {
  const safePdfUrl = appendCacheBuster(pdfUrl, cacheToken);
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(safePdfUrl)}&cb=${cacheToken}`;
}

export default function PdfViewerScreen() {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
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

  const [cacheToken, setCacheToken] = React.useState(1);
  const [hasError, setHasError] = React.useState(false);
  const loadTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRenderedPdfRef = React.useRef(false);

  const hasValidPdfUrl = normalizedPdfUrl.length > 0;
  const sourceUrl = React.useMemo(
    () => (hasValidPdfUrl ? buildGoogleViewerUrl(normalizedPdfUrl, cacheToken) : ""),
    [cacheToken, hasValidPdfUrl, normalizedPdfUrl]
  );
  const webViewKey = `gview-${cacheToken}`;

  React.useEffect(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    hasRenderedPdfRef.current = false;
    setCacheToken((currentValue) => currentValue + 1);
    setHasError(false);
  }, [normalizedPdfUrl]);

  React.useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, []);

  const clearLoadTimeout = React.useCallback(() => {
    if (!loadTimeoutRef.current) {
      return;
    }

    clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = null;
  }, []);

  const markLoadFailed = React.useCallback(() => {
    if (hasRenderedPdfRef.current) {
      return;
    }

    clearLoadTimeout();
    setHasError(true);
  }, [clearLoadTimeout]);

  const scheduleLoadTimeout = React.useCallback(() => {
    clearLoadTimeout();
    loadTimeoutRef.current = setTimeout(() => {
      if (hasRenderedPdfRef.current) {
        return;
      }
      setHasError(true);
    }, PDF_ATTEMPT_TIMEOUT_MS);
  }, [clearLoadTimeout]);

  const handleRetryInApp = React.useCallback(() => {
    clearLoadTimeout();
    hasRenderedPdfRef.current = false;
    setHasError(false);
    setCacheToken((currentValue) => currentValue + 1);
  }, [clearLoadTimeout]);

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
              This file did not load in Google Viewer. Tap retry to load it again.
            </Text>

            <View className="mt-5 w-full">
              <AppButton
                label="Retry"
                variant="primary"
                size="md"
                onPress={handleRetryInApp}
              />
            </View>
          </View>
        ) : (
          <View className="flex-1 overflow-hidden rounded-3xl bg-brand-white/95 dark:bg-brand-white/10">
            <WebView
              key={webViewKey}
              source={{ uri: sourceUrl }}
              originWhitelist={["*"]}
              cacheEnabled={false}
              incognito
              javaScriptEnabled
              domStorageEnabled
              mixedContentMode="always"
              setSupportMultipleWindows={false}
              startInLoadingState
              renderLoading={() => (
                <View className="flex-1 justify-center px-5">
                  <AppSkeletonTextGroup rows={6} rowHeight={12} />
                </View>
              )}
              onLoadStart={() => {
                setHasError(false);
                scheduleLoadTimeout();
              }}
              onLoadEnd={() => {
                hasRenderedPdfRef.current = true;
                clearLoadTimeout();
              }}
              onError={markLoadFailed}
              onHttpError={markLoadFailed}
              allowsBackForwardNavigationGestures
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
