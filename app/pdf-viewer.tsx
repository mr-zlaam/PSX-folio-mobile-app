import AppBackIconButton from "@/components/ui/app-back-icon-button";
import {
  AppSkeletonBlock,
  AppSkeletonTextGroup,
} from "@/components/ui/app-skeleton";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/src/lib/navigation";
import React from "react";
import {
  Linking,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";

const PSX_BASE_URL = "https://dps.psx.com.pk";
const PDF_ATTEMPT_TIMEOUT_MS = 12000;

type PdfViewerSourceKey = "gview" | "viewerng" | "direct";

type PdfViewerSource = {
  key: PdfViewerSourceKey;
  label: string;
  url: string;
};

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

function buildViewerNgUrl(pdfUrl: string, cacheToken: number): string {
  const safePdfUrl = appendCacheBuster(pdfUrl, cacheToken);
  return `https://drive.google.com/viewerng/viewer?embedded=true&url=${encodeURIComponent(safePdfUrl)}&hl=en&cb=${cacheToken}`;
}

function getPdfViewerSources(pdfUrl: string, cacheToken: number): PdfViewerSource[] {
  if (pdfUrl.length === 0) {
    return [];
  }

  const directUrl = appendCacheBuster(pdfUrl, cacheToken);
  const androidOrder: PdfViewerSource[] = [
    {
      key: "gview",
      label: "Google Viewer",
      url: buildGoogleViewerUrl(pdfUrl, cacheToken),
    },
    {
      key: "viewerng",
      label: "Drive Viewer",
      url: buildViewerNgUrl(pdfUrl, cacheToken),
    },
    {
      key: "direct",
      label: "Direct PDF",
      url: directUrl,
    },
  ];

  if (Platform.OS === "android") {
    return androidOrder;
  }

  return [
    {
      key: "direct",
      label: "Direct PDF",
      url: directUrl,
    },
    ...androidOrder.filter((source) => source.key !== "direct"),
  ];
}

function buildViewerProbeScript(): string {
  return `
    (function () {
      try {
        setTimeout(function () {
          var body = document.body;
          var text = (body && body.innerText ? body.innerText : '').toLowerCase();
          var html = (body && body.innerHTML ? body.innerHTML : '').toLowerCase();
          var hasRenderableNode = !!document.querySelector('iframe, embed, object, canvas, svg');
          var looksBroken =
            text.includes("couldn't preview file") ||
            text.includes("no preview available") ||
            text.includes("unable to preview") ||
            text.includes("failed to load") ||
            text.includes("unable to display") ||
            text.includes("file is too large") ||
            html.includes("error");
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'pdf-probe',
              status: looksBroken || (!hasRenderableNode && text.length < 8) ? 'failed' : 'ok'
            })
          );
        }, 1800);
      } catch (error) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: 'pdf-probe',
            status: 'failed'
          })
        );
      }
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
  const [sourceIndex, setSourceIndex] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);
  const loadTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceIndexRef = React.useRef(0);
  const sourceTransitionLockRef = React.useRef(false);

  React.useEffect(() => {
    sourceIndexRef.current = sourceIndex;
  }, [sourceIndex]);

  const viewerSources = React.useMemo(
    () => getPdfViewerSources(normalizedPdfUrl, cacheToken),
    [cacheToken, normalizedPdfUrl]
  );
  const activeViewerSource = viewerSources[sourceIndex] ?? null;
  const activeSourceUrl = activeViewerSource?.url ?? "";
  const isEmbeddedViewer = activeViewerSource?.key !== "direct";
  const webViewKey = `${activeViewerSource?.key ?? "none"}-${cacheToken}-${sourceIndex}`;

  React.useEffect(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    sourceTransitionLockRef.current = false;
    setCacheToken((currentValue) => currentValue + 1);
    setSourceIndex(0);
    setIsLoading(true);
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

  const moveToNextViewerSource = React.useCallback(() => {
    if (sourceTransitionLockRef.current) {
      return;
    }

    sourceTransitionLockRef.current = true;
    clearLoadTimeout();

    const nextIndex = sourceIndexRef.current + 1;
    if (nextIndex >= viewerSources.length) {
      setHasError(true);
      setIsLoading(false);
      sourceTransitionLockRef.current = false;
      return;
    }

    setHasError(false);
    setIsLoading(true);
    setSourceIndex(nextIndex);
    setCacheToken((currentValue) => currentValue + 1);

    setTimeout(() => {
      sourceTransitionLockRef.current = false;
    }, 220);
  }, [clearLoadTimeout, viewerSources.length]);

  const scheduleLoadTimeout = React.useCallback(() => {
    clearLoadTimeout();
    loadTimeoutRef.current = setTimeout(() => {
      moveToNextViewerSource();
    }, PDF_ATTEMPT_TIMEOUT_MS);
  }, [clearLoadTimeout, moveToNextViewerSource]);

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

  const handleRetryInApp = React.useCallback(() => {
    clearLoadTimeout();
    sourceTransitionLockRef.current = false;
    setHasError(false);
    setIsLoading(true);
    setSourceIndex(0);
    setCacheToken((currentValue) => currentValue + 1);
  }, [clearLoadTimeout]);

  const handleWebViewMessage = React.useCallback(
    (event: WebViewMessageEvent) => {
      if (!isEmbeddedViewer) {
        return;
      }

      try {
        const parsedData = JSON.parse(event.nativeEvent.data ?? "{}") as {
          type?: string;
          status?: string;
        };
        if (parsedData.type !== "pdf-probe") {
          return;
        }

        if (parsedData.status === "failed") {
          moveToNextViewerSource();
          return;
        }

        clearLoadTimeout();
      } catch {
        // Ignore malformed probe messages.
      }
    },
    [clearLoadTimeout, isEmbeddedViewer, moveToNextViewerSource]
  );

  const hasValidPdfUrl = normalizedPdfUrl.length > 0;
  const sourceLabel = activeViewerSource?.label ?? "PDF";

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
                onPress={handleRetryInApp}
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
              key={webViewKey}
              source={{ uri: activeSourceUrl }}
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
              injectedJavaScript={isEmbeddedViewer ? buildViewerProbeScript() : undefined}
              onMessage={handleWebViewMessage}
              onLoadStart={() => {
                setIsLoading(true);
                setHasError(false);
                scheduleLoadTimeout();
              }}
              onLoadEnd={() => {
                setIsLoading(false);
                clearLoadTimeout();
              }}
              onError={moveToNextViewerSource}
              onHttpError={moveToNextViewerSource}
              allowsBackForwardNavigationGestures
            />

            {isLoading ? (
              <View className="absolute right-3 top-3 rounded-xl bg-brand-white/90 px-2 py-1 dark:bg-brand-white/15">
                <View className="flex-row items-center gap-2">
                  <AppSkeletonBlock width={40} height={10} borderRadius={6} />
                  <Text className="text-[10px] font-semibold text-app-highlight dark:text-app-highlightDark">
                    {sourceLabel}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
