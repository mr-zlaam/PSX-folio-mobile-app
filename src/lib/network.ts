const NETWORK_CHECK_TIMEOUT_MS = 4000;
const NETWORK_CHECK_URL = "https://dps.psx.com.pk/";

export async function isInternetReachable(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, NETWORK_CHECK_TIMEOUT_MS);

  try {
    await fetch(NETWORK_CHECK_URL, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

