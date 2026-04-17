import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppButton from "@/components/ui/app-button";
import { AppSkeletonTextGroup } from "@/components/ui/app-skeleton";
import { useGuardedRouter } from "@/src/lib/navigation";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";

const PSX_BASE_URL = "https://dps.psx.com.pk";
const PDF_ATTEMPT_TIMEOUT_MS = 22000;
const PDF_SECONDARY_TIMEOUT_MS = 9000;
const PDF_MAX_AUTO_ATTEMPTS = 3;

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

function buildGoogleViewerProbeScript(): string {
  return `
    (function () {
      try {
        var postStatus = function (status) {
          try {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: "gview-probe", status: status })
            );
          } catch (e) {}
        };

        var hasKnownErrorText = function () {
          var body = document.body;
          var text = (body && body.innerText ? body.innerText : "").toLowerCase();
          return (
            text.includes("couldn't preview file") ||
            text.includes("no preview available") ||
            text.includes("unable to preview") ||
            text.includes("unable to display") ||
            text.includes("failed to load") ||
            text.includes("something went wrong") ||
            text.includes("file not found") ||
            text.includes("file is too large")
          );
        };

        setTimeout(function () {
          if (hasKnownErrorText()) {
            postStatus("failed");
          }
        }, 2500);

        setTimeout(function () {
          if (hasKnownErrorText()) {
            postStatus("failed");
          }
        }, 7000);
      } catch (error) {}
      true;
    })();
  `;
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
  const [attemptCount, setAttemptCount] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAutoRetrying, setIsAutoRetrying] = React.useState(false);
  const loadTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondaryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadProgressRef = React.useRef(0);
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
    if (secondaryTimeoutRef.current) {
      clearTimeout(secondaryTimeoutRef.current);
      secondaryTimeoutRef.current = null;
    }
    loadProgressRef.current = 0;
    hasRenderedPdfRef.current = false;
    setCacheToken(1);
    setAttemptCount(1);
    setHasError(false);
    setIsLoading(true);
    setIsAutoRetrying(false);
  }, [normalizedPdfUrl]);

  React.useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      if (secondaryTimeoutRef.current) {
        clearTimeout(secondaryTimeoutRef.current);
        secondaryTimeoutRef.current = null;
      }
    };
  }, []);

  const clearTimeouts = React.useCallback(() => {
    if (!loadTimeoutRef.current) {
      // continue
    } else {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    if (secondaryTimeoutRef.current) {
      clearTimeout(secondaryTimeoutRef.current);
      secondaryTimeoutRef.current = null;
    }
  }, []);

  const advanceToNextAttempt = React.useCallback(() => {
    if (hasRenderedPdfRef.current) {
      return;
    }

    clearTimeouts();

    if (attemptCount >= PDF_MAX_AUTO_ATTEMPTS) {
      setIsAutoRetrying(false);
      setIsLoading(false);
      setHasError(true);
      return;
    }

    setIsAutoRetrying(true);
    setHasError(false);
    setIsLoading(true);
    setAttemptCount((currentAttempt) => currentAttempt + 1);
    setCacheToken((currentToken) => currentToken + 1);
  }, [attemptCount, clearTimeouts]);

  const scheduleLoadTimeout = React.useCallback(() => {
    clearTimeouts();
    loadTimeoutRef.current = setTimeout(() => {
      if (hasRenderedPdfRef.current) {
        return;
      }
      advanceToNextAttempt();
    }, PDF_ATTEMPT_TIMEOUT_MS);
  }, [advanceToNextAttempt, clearTimeouts]);

  const handleRetryInApp = React.useCallback(() => {
    clearTimeouts();
    loadProgressRef.current = 0;
    hasRenderedPdfRef.current = false;
    setHasError(false);
    setIsLoading(true);
    setIsAutoRetrying(false);
    setAttemptCount(1);
    setCacheToken((currentValue) => currentValue + 1);
  }, [clearTimeouts]);

  const handleWebViewMessage = React.useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const parsedData = JSON.parse(event.nativeEvent.data ?? "{}") as {
          type?: string;
          status?: string;
        };
        if (parsedData.type !== "gview-probe") {
          return;
        }

        if (parsedData.status === "failed") {
          advanceToNextAttempt();
        }
      } catch {
        // ignore malformed probe messages
      }
    },
    [advanceToNextAttempt]
  );

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
            <View className="absolute right-3 top-3 z-20 rounded-xl bg-brand-white/90 px-2 py-1 dark:bg-brand-white/15">
              <Text className="text-[10px] font-semibold text-app-highlight dark:text-app-highlightDark">
                {isAutoRetrying
                  ? `Retrying ${attemptCount}/${PDF_MAX_AUTO_ATTEMPTS}`
                  : `Loading ${attemptCount}/${PDF_MAX_AUTO_ATTEMPTS}`}
              </Text>
            </View>
            <WebView
              key={webViewKey}
              source={{ uri: sourceUrl }}
              originWhitelist={["*"]}
              cacheEnabled
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
              injectedJavaScript={buildGoogleViewerProbeScript()}
              onMessage={handleWebViewMessage}
              onLoadProgress={(event) => {
                const nextProgress = event.nativeEvent.progress ?? 0;
                loadProgressRef.current = Math.max(loadProgressRef.current, nextProgress);
              }}
              onLoadStart={() => {
                setIsLoading(true);
                setIsAutoRetrying(false);
                loadProgressRef.current = 0;
                setHasError(false);
                scheduleLoadTimeout();
              }}
              onLoadEnd={() => {
                if (loadProgressRef.current >= 0.45) {
                  hasRenderedPdfRef.current = true;
                  setIsLoading(false);
                  clearTimeouts();
                  return;
                }

                clearTimeouts();
                secondaryTimeoutRef.current = setTimeout(() => {
                  if (hasRenderedPdfRef.current) {
                    return;
                  }
                  if (loadProgressRef.current >= 0.45) {
                    hasRenderedPdfRef.current = true;
                    setIsLoading(false);
                    return;
                  }
                  advanceToNextAttempt();
                }, PDF_SECONDARY_TIMEOUT_MS);
              }}
              onError={advanceToNextAttempt}
              onHttpError={advanceToNextAttempt}
              allowsBackForwardNavigationGestures
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
