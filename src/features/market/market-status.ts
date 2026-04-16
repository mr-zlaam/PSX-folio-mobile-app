const PAKISTAN_UTC_OFFSET_MINUTES = 5 * 60;
const STALE_THRESHOLD_MINUTES_DEFAULT = 5;
export const PSX_DELAYED_FEED_MINUTES = 5;

const FRIDAY_WEEKDAY = 5;
const SATURDAY_WEEKDAY = 6;
const SUNDAY_WEEKDAY = 0;

const PSX_HOLIDAY_DATES_PAKISTAN = new Set<string>([
  // Kept explicit for current app behavior; this list can be expanded from a PSX holiday feed later.
  "2026-03-20",
  "2026-03-21",
  "2026-03-22",
  "2026-03-23",
]);

export type PsxSessionPhase =
  | "PRE_OPEN"
  | "OPEN"
  | "POST_CLOSE"
  | "RECTIFICATION"
  | "CLOSED";

export type PsxMarketCondition = "OPEN" | "HALTED" | "CLOSED";

export type PsxMarketStatus = {
  sessionPhase: PsxSessionPhase;
  condition: PsxMarketCondition;
  uiStatus: "OPEN" | "CLOSED";
  minutesSinceUpdate: number | null;
  isWeekend: boolean;
  isHoliday: boolean;
  dateKeyPakistan: string;
};

function padTwoDigits(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function getPakistanDate(nowUtcMs: number): Date {
  return new Date(nowUtcMs + PAKISTAN_UTC_OFFSET_MINUTES * 60 * 1000);
}

function getPakistanDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = padTwoDigits(date.getUTCMonth() + 1);
  const day = padTwoDigits(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

function getPakistanMinutesOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function isWeekendInPakistan(weekday: number): boolean {
  return weekday === SATURDAY_WEEKDAY || weekday === SUNDAY_WEEKDAY;
}

function getSessionPhaseFromMinutes(
  weekday: number,
  minutesOfDay: number
): PsxSessionPhase {
  // Session windows from PSX timings.
  // Mon-Thu: Open 09:17-13:30, Fri: Open 09:17-12:30.
  const preOpenStart = 9 * 60;
  const openStart = 9 * 60 + 17;

  if (weekday === FRIDAY_WEEKDAY) {
    const openEnd = 12 * 60 + 30;
    const postCloseStart = 12 * 60 + 35;
    const postCloseEnd = 12 * 60 + 50;
    const rectificationEnd = 13 * 60 + 20;

    if (minutesOfDay >= preOpenStart && minutesOfDay < openStart) {
      return "PRE_OPEN";
    }

    if (minutesOfDay >= openStart && minutesOfDay < openEnd) {
      return "OPEN";
    }

    if (minutesOfDay >= postCloseStart && minutesOfDay < postCloseEnd) {
      return "POST_CLOSE";
    }

    if (minutesOfDay >= postCloseEnd && minutesOfDay < rectificationEnd) {
      return "RECTIFICATION";
    }

    return "CLOSED";
  }

  const openEnd = 13 * 60 + 30;
  const postCloseStart = 13 * 60 + 35;
  const postCloseEnd = 13 * 60 + 50;
  const rectificationEnd = 14 * 60 + 20;

  if (minutesOfDay >= preOpenStart && minutesOfDay < openStart) {
    return "PRE_OPEN";
  }

  if (minutesOfDay >= openStart && minutesOfDay < openEnd) {
    return "OPEN";
  }

  if (minutesOfDay >= postCloseStart && minutesOfDay < postCloseEnd) {
    return "POST_CLOSE";
  }

  if (minutesOfDay >= postCloseEnd && minutesOfDay < rectificationEnd) {
    return "RECTIFICATION";
  }

  return "CLOSED";
}

function getSessionPhase(
  nowUtcMs: number,
  extraHolidayDatesPakistan: string[]
): {
  phase: PsxSessionPhase;
  isWeekend: boolean;
  isHoliday: boolean;
  dateKeyPakistan: string;
} {
  const pakistanDate = getPakistanDate(nowUtcMs);
  const weekday = pakistanDate.getUTCDay();
  const minutesOfDay = getPakistanMinutesOfDay(pakistanDate);
  const dateKeyPakistan = getPakistanDateKey(pakistanDate);
  const isWeekend = isWeekendInPakistan(weekday);

  const holidaySet = new Set([
    ...PSX_HOLIDAY_DATES_PAKISTAN,
    ...extraHolidayDatesPakistan,
  ]);
  const isHoliday = holidaySet.has(dateKeyPakistan);

  if (isWeekend || isHoliday) {
    return {
      phase: "CLOSED",
      isWeekend,
      isHoliday,
      dateKeyPakistan,
    };
  }

  return {
    phase: getSessionPhaseFromMinutes(weekday, minutesOfDay),
    isWeekend,
    isHoliday,
    dateKeyPakistan,
  };
}

function getMinutesSinceUpdate(asOf: string | null, nowUtcMs: number): number | null {
  if (!asOf) {
    return null;
  }

  const updatedAtMs = new Date(asOf).getTime();
  if (!Number.isFinite(updatedAtMs)) {
    return null;
  }

  return (nowUtcMs - updatedAtMs) / (1000 * 60);
}

function toValidTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsedTimestamp = new Date(value).getTime();
  if (!Number.isFinite(parsedTimestamp)) {
    return null;
  }

  return parsedTimestamp;
}

export function getDelayedFeedRefreshDueAtMs(
  asOf: string | null,
  options?: {
    delayMinutes?: number;
  }
): number | null {
  const timestamp = toValidTimestamp(asOf);
  if (timestamp === null) {
    return null;
  }

  const delayMinutes = options?.delayMinutes ?? PSX_DELAYED_FEED_MINUTES;
  return timestamp + delayMinutes * 60 * 1000;
}

export function getDelayedFeedRemainingMs(
  asOf: string | null,
  options?: {
    delayMinutes?: number;
    nowUtcMs?: number;
  }
): number | null {
  const dueAtMs = getDelayedFeedRefreshDueAtMs(asOf, {
    delayMinutes: options?.delayMinutes,
  });
  if (dueAtMs === null) {
    return null;
  }

  const nowUtcMs = options?.nowUtcMs ?? Date.now();
  return Math.max(0, dueAtMs - nowUtcMs);
}

export function shouldFetchLiveFromDelayedFeed(options: {
  asOf: string | null;
  marketUiStatus: "OPEN" | "CLOSED" | "HALTED";
  hasUsableCache: boolean;
  forceLive?: boolean;
  delayMinutes?: number;
  nowUtcMs?: number;
}): boolean {
  const {
    asOf,
    marketUiStatus,
    hasUsableCache,
    forceLive = false,
    delayMinutes = PSX_DELAYED_FEED_MINUTES,
    nowUtcMs = Date.now(),
  } = options;

  if (forceLive) {
    return true;
  }

  if (!hasUsableCache) {
    return true;
  }

  if (marketUiStatus !== "OPEN") {
    return false;
  }

  const dueAtMs = getDelayedFeedRefreshDueAtMs(asOf, {
    delayMinutes,
  });
  if (dueAtMs === null) {
    return true;
  }

  return nowUtcMs >= dueAtMs;
}

export function evaluatePsxMarketStatus(
  asOf: string | null,
  options?: {
    nowUtcMs?: number;
    staleThresholdMinutes?: number;
    extraHolidayDatesPakistan?: string[];
  }
): PsxMarketStatus {
  const nowUtcMs = options?.nowUtcMs ?? Date.now();
  const staleThresholdMinutes =
    options?.staleThresholdMinutes ?? STALE_THRESHOLD_MINUTES_DEFAULT;
  const extraHolidayDatesPakistan = options?.extraHolidayDatesPakistan ?? [];

  const schedule = getSessionPhase(nowUtcMs, extraHolidayDatesPakistan);
  const minutesSinceUpdate = getMinutesSinceUpdate(asOf, nowUtcMs);
  const isFreshEnough =
    typeof minutesSinceUpdate === "number" &&
    minutesSinceUpdate >= -2 &&
    minutesSinceUpdate <= staleThresholdMinutes;

  const condition: PsxMarketCondition =
    schedule.phase !== "OPEN" ? "CLOSED" : isFreshEnough ? "OPEN" : "HALTED";

  return {
    sessionPhase: schedule.phase,
    condition,
    uiStatus: condition === "OPEN" ? "OPEN" : "CLOSED",
    minutesSinceUpdate,
    isWeekend: schedule.isWeekend,
    isHoliday: schedule.isHoliday,
    dateKeyPakistan: schedule.dateKeyPakistan,
  };
}
