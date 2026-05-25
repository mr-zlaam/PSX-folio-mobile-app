import { Href, useRouter } from "expo-router";
import React from "react";

const SAME_ROUTE_GUARD_MS = 1200;
const GLOBAL_GUARD_MS = 300;
const HISTORY_TTL_MS = 10_000;

const pushHistoryByRoute = new Map<string, number>();
let globalGuardUntil = 0;

function normalizeHrefKey(href: Href): string {
  if (typeof href === "string") {
    return href;
  }

  try {
    return JSON.stringify(href);
  } catch {
    return String(href);
  }
}

function pruneOldHistory(now: number): void {
  pushHistoryByRoute.forEach((timestamp, routeKey) => {
    if (now - timestamp > HISTORY_TTL_MS) {
      pushHistoryByRoute.delete(routeKey);
    }
  });
}

function shouldBlockPush(href: Href): boolean {
  const now = Date.now();
  if (now < globalGuardUntil) {
    return true;
  }

  pruneOldHistory(now);

  const routeKey = normalizeHrefKey(href);
  const lastPushAt = pushHistoryByRoute.get(routeKey);
  if (typeof lastPushAt === "number" && now - lastPushAt < SAME_ROUTE_GUARD_MS) {
    return true;
  }

  pushHistoryByRoute.set(routeKey, now);
  globalGuardUntil = now + GLOBAL_GUARD_MS;
  return false;
}

export function useGuardedRouter() {
  const router = useRouter();
  const routerRef = React.useRef(router);
  routerRef.current = router;

  const guardedPush = React.useCallback(
    (href: Href) => {
      if (shouldBlockPush(href)) {
        return;
      }
      routerRef.current.push(href);
    },
    [],
  );

  const guardedReplace = React.useCallback(
    (href: Href) => {
      if (shouldBlockPush(href)) {
        return;
      }
      routerRef.current.replace(href);
    },
    [],
  );

  const guardedBack = React.useCallback(() => {
    routerRef.current.back();
  }, []);

  const guardedSetParams = React.useCallback(
    (params: Record<string, undefined | string | number | (string | number)[]>) => {
      routerRef.current.setParams(params);
    },
    [],
  );

  return React.useMemo(
    () => ({
      back: guardedBack,
      push: guardedPush,
      replace: guardedReplace,
      setParams: guardedSetParams,
    }),
    [guardedBack, guardedPush, guardedReplace, guardedSetParams],
  );
}
