/**
 * Unified date and time utilities for the application.
 * ALL logic strictly follows the Flashscore Standard:
 * - Date: YYYY-MM-DD (strictly UTC)
 * - Time: HH:mm (strictly 24h UTC)
 * - Full ISO: YYYY-MM-DDTHH:mm:ss.sssZ
 */

let cachedSeasonKey = '';
let cachedSeasonVal = '';

/**
 * Gets current season string (e.g. 2024/2025).
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const dayKey = year * 16 + month;
  if (dayKey !== Number(cachedSeasonKey)) {
    cachedSeasonKey = String(dayKey);
    cachedSeasonVal = month >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }
  return cachedSeasonVal;
}

/**
 * Gets current UTC date string (YYYY-MM-DD).
 */
export function getUtcDateStr(offsetDays = 0, baseDate: Date = new Date()): string {
  const d = offsetDays === 0 ? baseDate : new Date(baseDate.getTime() + offsetDays * 86400000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fast timestamp parser treating bare YYYY-MM-DD strings as UTC noon (matching JS Date ISO convention consistently).
 */
export function parseDateMsNoon(dateStr?: string): number {
  if (!dateStr) return NaN;
  if (dateStr.length === 10 && dateStr.charCodeAt(4) === 45 && dateStr.charCodeAt(7) === 45) {
    const y = Number(dateStr.slice(0, 4));
    const m = Number(dateStr.slice(5, 7));
    const d = Number(dateStr.slice(8, 10));
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return Date.UTC(y, m - 1, d, 12, 0, 0);
    }
  }
  return new Date(dateStr.length === 10 ? `${dateStr}T12:00:00Z` : dateStr).getTime();
}

/**
 * Gets a standardized UTC date string (YYYY-MM-DD).
 */
export function getStandardDateStr(d: Date | string | number = new Date()): string {
  const dateObj = typeof d === 'object' ? d : new Date(d);
  if (isNaN(dateObj.getTime())) {
    return getUtcDateStr(0);
  }
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets a date string relative to today in standard UTC YYYY-MM-DD format.
 */
export function getRelativeDateStr(offsetDays = 0): string {
  return getUtcDateStr(offsetDays);
}

/**
 * Standardizes any date string into Flashscore YYYY-MM-DD UTC format.
 */
export function normalizeDateStr(dateStr: string): string {
  if (!dateStr) return getStandardDateStr();
  const trimmed = dateStr.trim();

  // Fast path: already exact YYYY-MM-DD (most frequent in SQLite/feeds)
  if (
    trimmed.length >= 10 &&
    trimmed.charCodeAt(4) === 45 &&
    trimmed.charCodeAt(7) === 45 &&
    trimmed.charCodeAt(0) >= 48 &&
    trimmed.charCodeAt(0) <= 57
  ) {
    const sub = trimmed.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(sub)) return sub;
  }

  // If already YYYY/MM/DD or YYYY.MM.DD
  if (/^\d{4}[-/.]\d{2}[-/.]\d{2}/.test(trimmed)) {
    return trimmed.substring(0, 10).replace(/[/.]/g, '-');
  }

  // Handle DD-MM-YYYY, DD/MM/YYYY, or DD.MM.YYYY
  const reverseMatch = trimmed.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/);
  if (reverseMatch) {
    const [, d, m, y] = reverseMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Handle DD.MM. (Flashscore short date without year)
  const shortMatch = trimmed.match(/^(\d{1,2})[.](\d{1,2})\.?$/);
  if (shortMatch) {
    const currentYear = new Date().getUTCFullYear();
    const [, d, m] = shortMatch;
    return `${currentYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Handle Unix numeric timestamp (seconds or milliseconds)
  if (/^\d{9,13}$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    const dateObj = new Date(num > 1e11 ? num : num * 1000);
    if (!isNaN(dateObj.getTime())) {
      return getStandardDateStr(dateObj);
    }
  }

  // Fallback: try native Date parser
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return getStandardDateStr(d);
  }

  return trimmed;
}

/**
 * Standardizes any time string into Flashscore HH:mm 24h UTC format.
 */
export function normalizeTimeStr(timeStr: string): string {
  if (!timeStr) return '12:00';
  const upper = timeStr.trim().toUpperCase();
  if (['FT', 'HT', 'AET', 'AP', 'TBD', 'POSTPONED', 'PST', 'CANCELLED', 'CAN', 'INT', 'LIVE'].includes(upper)) {
    return upper;
  }

  const match = timeStr.trim().match(/^(\d{1,2})[:.](\d{2})\s*(AM|PM)?/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3]?.toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  return timeStr;
}

/**
 * Checks if a match at a given date/time or epoch timestamp has officially kicked off.
 * Strictly uses Flashscore UTC standard time.
 */
export function hasMatchStarted(matchDate: string, kickOffTime: string, epochTimestamp?: number): boolean {
  if (epochTimestamp && epochTimestamp > 0) {
    const matchMs = epochTimestamp > 1e11 ? epochTimestamp : epochTimestamp * 1000;
    return matchMs <= Date.now();
  }

  if (!matchDate) return false;
  const normTime = normalizeTimeStr(kickOffTime);
  const upperTime = normTime.toUpperCase();

  if (['FT', 'HT', 'AET', 'AP', 'LIVE', 'FINISHED', 'IN_PLAY', '1H', '2H', 'EXTRA_TIME'].includes(upperTime)) {
    return true;
  }
  if (['TBD', 'POSTPONED', 'PST', 'CANCELLED', 'CAN'].includes(upperTime)) {
    return false;
  }

  const normDate = normalizeDateStr(matchDate);
  const utcToday = getStandardDateStr();

  if (normDate < utcToday) return true;
  if (normDate > utcToday) return false;

  const dateParts = normDate.split('-').map((p) => parseInt(p, 10));
  if (dateParts.length !== 3 || dateParts.some(isNaN)) return false;

  let hours = 12;
  let minutes = 0;
  if (normTime && normTime.includes(':')) {
    const timeParts = normTime.split(':').map((p) => parseInt(p, 10));
    if (timeParts.length >= 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
      hours = timeParts[0];
      minutes = timeParts[1];
    }
  }

  const matchUtcMs = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], hours, minutes);
  return matchUtcMs <= Date.now();
}

/**
 * Formats match date and time for UI display in standard Flashscore UTC format.
 */
export function formatMatchDateTime(
  matchDate: string,
  kickOffTime: string,
  epochTimestamp?: number | string
): { dateStr: string; timeStr: string } {
  const normTime = normalizeTimeStr(kickOffTime);
  const upperTime = normTime.toUpperCase();

  // Non-clock statuses like FT, HT, LIVE, POSTPONED, or live minute (e.g. 45') are returned as-is
  if (
    ['FT', 'HT', 'AET', 'AP', 'LIVE', 'FINISHED', 'IN_PLAY', 'TBD', 'POSTPONED', 'PST', 'CANCELLED', 'CAN'].includes(upperTime) ||
    upperTime.endsWith("'")
  ) {
    return {
      dateStr: normalizeDateStr(matchDate),
      timeStr: normTime,
    };
  }

  // 1. If epochTimestamp is provided and valid, format in local browser timezone
  const numericTs = epochTimestamp ? Number(epochTimestamp) : undefined;
  if (numericTs && !isNaN(numericTs) && numericTs > 0) {
    const d = new Date(numericTs > 1e11 ? numericTs : numericTs * 1000);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return {
        dateStr: `${year}-${month}-${day}`,
        timeStr: `${hours}:${minutes}`,
      };
    }
  }

  // 2. If epochTimestamp is missing, parse matchDate + normTime as canonical UTC.
  // Flashscore feeds store kickOffTime and matchDate in UTC (e.g. "19:45" UTC).
  // In the browser, Date.UTC(...) converted to local Date displays in the user's local timezone.
  const timeMatch = normTime.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const normDate = normalizeDateStr(matchDate);
    const dateParts = normDate.split('-').map((p) => parseInt(p, 10));
    if (dateParts.length === 3 && !dateParts.some(isNaN)) {
      const hoursUtc = parseInt(timeMatch[1], 10);
      const minutesUtc = parseInt(timeMatch[2], 10);
      const utcMs = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], hoursUtc, minutesUtc);
      const d = new Date(utcMs);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return {
          dateStr: `${year}-${month}-${day}`,
          timeStr: `${hours}:${minutes}`,
        };
      }
    }
  }

  return {
    dateStr: normalizeDateStr(matchDate),
    timeStr: normTime,
  };
}

/**
 * Convenience helper to return formatted UTC match date (YYYY-MM-DD).
 */
export function getFixtureUtcDate(
  fixture: { matchDate?: string; kickOffTime?: string; timestamp?: number | string }
): string {
  return formatMatchDateTime(
    fixture.matchDate || '',
    fixture.kickOffTime || '',
    fixture.timestamp
  ).dateStr;
}

export interface CalendarStripDay {
  index: number;
  dateStr: string;
  filterKey: string;
  dayTwoLetter: string;
  dayNum: number;
  shortLabel: string;
  fullLabel: string;
}

export interface DateFilterOption {
  key: string;
  label: string;
}

export type ResolvedDateFilter =
  | { kind: 'ALL'; canonicalKey: 'ALL' }
  | { kind: 'SINGLE'; canonicalKey: string; targetDate: string; dayIndex: number | null }
  | { kind: 'RANGE'; canonicalKey: 'NEXT_3_DAYS' | 'THIS_WEEK'; startDate: string; endDate: string };

const DAY_TWO_LETTER_MAP: Record<string, string> = {
  Sun: 'Su',
  Mon: 'Mo',
  Tue: 'Tu',
  Wed: 'Wed',
  Thu: 'Th',
  Fri: 'Fr',
  Sat: 'Sa',
};

const calendarStripCache = new Map<string, CalendarStripDay[]>();

/**
 * Generates the unified 7-day UTC calendar strip shared by the top day selector bar and filter modal.
 * Cached per UTC day & count to eliminate repeated Intl toLocaleDateString formatting overhead in loops.
 */
export function getCalendarStripDays(count = 7, baseDate: Date = new Date()): CalendarStripDay[] {
  const baseKey = `${getUtcDateStr(0, baseDate)}:${count}`;
  const cached = calendarStripCache.get(baseKey);
  if (cached) return cached;

  const days: CalendarStripDay[] = [];
  for (let i = 0; i < count; i++) {
    const dateStr = getUtcDateStr(i, baseDate);
    const [y, m, dNum] = dateStr.split('-').map((p) => parseInt(p, 10));
    const utcDateObj = new Date(Date.UTC(y, m - 1, dNum));
    const rawDayShort = utcDateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const monthShort = utcDateObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const dayTwoLetter = DAY_TWO_LETTER_MAP[rawDayShort] || rawDayShort;
    const formattedDate = `${rawDayShort}, ${monthShort} ${dNum}`;

    const filterKey = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : dateStr;
    const shortLabel =
      i === 0 ? `Today (${monthShort} ${dNum})` : i === 1 ? `Tomorrow (${monthShort} ${dNum})` : formattedDate;
    const fullLabel =
      i === 0 ? `Today · ${formattedDate}` : i === 1 ? `Tomorrow · ${formattedDate}` : formattedDate;

    days.push({
      index: i,
      dateStr,
      filterKey,
      dayTwoLetter,
      dayNum: dNum,
      shortLabel,
      fullLabel,
    });
  }

  if (calendarStripCache.size > 16) calendarStripCache.clear();
  calendarStripCache.set(baseKey, days);
  return days;
}

/**
 * Resolves any date filter token ('TODAY', 'TOMORROW', 'DAY_2'..'DAY_6', 'NEXT_3_DAYS', 'THIS_WEEK', 'ALL', or 'YYYY-MM-DD')
 * into a canonical descriptor so top bar, filter modal, and queries stay synchronized.
 */
export function resolveDateFilter(
  dateFilter?: string | null,
  baseDate: Date = new Date()
): ResolvedDateFilter {
  const raw = (dateFilter || 'TODAY').trim();
  const upper = raw.toUpperCase();

  if (upper === 'ALL') {
    return { kind: 'ALL', canonicalKey: 'ALL' };
  }

  if (upper === 'TODAY') {
    return {
      kind: 'SINGLE',
      canonicalKey: 'TODAY',
      targetDate: getUtcDateStr(0, baseDate),
      dayIndex: 0,
    };
  }

  if (upper === 'TOMORROW') {
    return {
      kind: 'SINGLE',
      canonicalKey: 'TOMORROW',
      targetDate: getUtcDateStr(1, baseDate),
      dayIndex: 1,
    };
  }

  const dayOffsetMatch = upper.match(/^DAY_(\d+)$/);
  if (dayOffsetMatch) {
    const offset = parseInt(dayOffsetMatch[1], 10);
    const targetDate = getUtcDateStr(offset, baseDate);
    const canonicalKey = offset === 0 ? 'TODAY' : offset === 1 ? 'TOMORROW' : targetDate;
    return {
      kind: 'SINGLE',
      canonicalKey,
      targetDate,
      dayIndex: offset >= 0 && offset < 7 ? offset : null,
    };
  }

  if (upper === 'NEXT_3_DAYS') {
    return {
      kind: 'RANGE',
      canonicalKey: 'NEXT_3_DAYS',
      startDate: getUtcDateStr(0, baseDate),
      endDate: getUtcDateStr(2, baseDate),
    };
  }

  if (upper === 'THIS_WEEK') {
    return {
      kind: 'RANGE',
      canonicalKey: 'THIS_WEEK',
      startDate: getUtcDateStr(0, baseDate),
      endDate: getUtcDateStr(6, baseDate),
    };
  }

  const normalized = normalizeDateStr(raw);
  const strip = getCalendarStripDays(7, baseDate);
  const matchedDay = strip.find((d) => d.dateStr === normalized);
  if (matchedDay) {
    return {
      kind: 'SINGLE',
      canonicalKey: matchedDay.filterKey,
      targetDate: matchedDay.dateStr,
      dayIndex: matchedDay.index,
    };
  }

  return {
    kind: 'SINGLE',
    canonicalKey: normalized,
    targetDate: normalized,
    dayIndex: null,
  };
}

/**
 * Checks whether a fixture matches a pre-resolved date filter (avoids re-resolving inside hot loops).
 */
export function matchesResolvedDateFilter(
  fixture: { matchDate?: string; kickOffTime?: string; timestamp?: number },
  resolved: ResolvedDateFilter
): boolean {
  if (resolved.kind === 'ALL') return true;

  const matchDateNorm = normalizeDateStr(fixture.matchDate || '');
  const utcDateNorm = normalizeDateStr(getFixtureUtcDate(fixture));

  if (resolved.kind === 'SINGLE') {
    return matchDateNorm === resolved.targetDate || utcDateNorm === resolved.targetDate;
  }

  return (
    (matchDateNorm >= resolved.startDate && matchDateNorm <= resolved.endDate) ||
    (utcDateNorm >= resolved.startDate && utcDateNorm <= resolved.endDate)
  );
}

/**
 * Checks whether a fixture matches a given dateFilter (single day, multi-day range, or all dates).
 */
export function matchesDateFilter(
  fixture: { matchDate?: string; kickOffTime?: string; timestamp?: number },
  dateFilter?: string | null,
  baseDate: Date = new Date()
): boolean {
  return matchesResolvedDateFilter(fixture, resolveDateFilter(dateFilter, baseDate));
}

/**
 * Generates the unified date filter options list matching the 7-day strip and range presets.
 */
export function getDateFilterOptions(baseDate: Date = new Date()): DateFilterOption[] {
  const stripDays = getCalendarStripDays(7, baseDate);
  return [
    ...stripDays.map((d) => ({
      key: d.filterKey,
      label: d.shortLabel,
    })),
    { key: 'NEXT_3_DAYS', label: 'Next 3 Days' },
    { key: 'THIS_WEEK', label: 'This Week (7 Days)' },
    { key: 'ALL', label: 'All Dates' },
  ];
}

/**
 * Returns a human-readable display label for any active date filter value.
 */
export function getDateFilterDisplayLabel(
  dateFilter?: string | null,
  baseDate: Date = new Date()
): string {
  const resolved = resolveDateFilter(dateFilter, baseDate);
  const options = getDateFilterOptions(baseDate);
  const matched = options.find((opt) => opt.key === resolved.canonicalKey);
  if (matched) return matched.label;
  if (resolved.kind === 'SINGLE') {
    const [y, m, dNum] = resolved.targetDate.split('-').map((p) => parseInt(p, 10));
    if (!isNaN(y) && !isNaN(m) && !isNaN(dNum)) {
      const utcDateObj = new Date(Date.UTC(y, m - 1, dNum));
      return utcDateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
    return resolved.targetDate;
  }
  return String(dateFilter || 'Today');
}

/**
 * Determines whether a football match has already kicked off or finished.
 */
export function isMatchStarted(f?: {
  status?: string;
  score?: { home?: number; away?: number };
  matchDate?: string;
  kickOffTime?: string;
}): boolean {
  if (!f) return true;

  if (f.status) {
    const s = String(f.status).toUpperCase().trim();
    if (
      s === 'LIVE' ||
      s === 'FINISHED' ||
      s === 'IN_PLAY' ||
      s === 'IN' ||
      s === 'POST' ||
      s === 'FT' ||
      s === 'HT' ||
      s === 'POSTPONED' ||
      s === 'CANCELLED' ||
      s === 'SUSPENDED' ||
      s === 'ABANDONED' ||
      s === 'AET' ||
      s === 'PEN' ||
      s === '1H' ||
      s === '2H' ||
      s === 'BREAK' ||
      s === 'INT' ||
      s === 'EXTRA_TIME' ||
      s === 'PENALTIES'
    ) {
      return true;
    }
  }

  if (f.score && (f.score.home !== undefined || f.score.away !== undefined)) {
    if ((f.score.home || 0) > 0 || (f.score.away || 0) > 0) {
      if (f.status !== 'SCHEDULED' && f.status !== 'TIMED') return true;
    }
  }

  return hasMatchStarted(f.matchDate || '', f.kickOffTime || '');
}


