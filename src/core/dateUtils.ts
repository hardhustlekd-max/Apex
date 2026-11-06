/**
 * Unified date and time utilities for the application.
 * All date/time strings follow the Flashscore Standard:
 * - Date: YYYY-MM-DD (e.g. 2026-10-31)
 * - Time: HH:mm (24h UTC, e.g. 15:30)
 * - Full ISO: YYYY-MM-DDTHH:mm:ss.sssZ
 */

/**
 * Gets current season string (e.g. 2024/2025).
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return month >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

/**
 * Gets a standardized date string (YYYY-MM-DD) in local browser/system timezone or UTC.
 */
export function getStandardDateStr(d: Date | string | number = new Date(), preferLocal = true): string {
  const dateObj = typeof d === 'object' ? d : new Date(d);
  if (isNaN(dateObj.getTime())) {
    return getLocalDateStr(0);
  }
  if (preferLocal) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets a standardized time string (HH:mm) in 24h format.
 */
export function getStandardTimeStr(d: Date | string | number = new Date(), preferLocal = true): string {
  const dateObj = typeof d === 'object' ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '12:00';
  if (preferLocal) {
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  const hours = String(dateObj.getUTCHours()).padStart(2, '0');
  const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Gets date string in local browser/system timezone (YYYY-MM-DD).
 */
export function getLocalDateStr(offsetDays = 0, baseDate: Date = new Date()): string {
  const d = new Date(baseDate.getTime());
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets current UTC date string (YYYY-MM-DD).
 */
export function getUtcDateStr(offsetDays = 0, baseDate: Date = new Date()): string {
  const d = new Date(baseDate.getTime());
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets a date string relative to today in standard YYYY-MM-DD format.
 */
export function getRelativeDateStr(offsetDays = 0, preferLocal = true): string {
  if (preferLocal) {
    return getLocalDateStr(offsetDays);
  }
  return getUtcDateStr(offsetDays);
}

/**
 * Returns possible date strings for a relative day offset (includes both local timezone date and UTC date).
 */
export function getPossibleDateStrs(offsetDays = 0): string[] {
  const localDate = getLocalDateStr(offsetDays);
  const utcDate = getUtcDateStr(offsetDays);
  if (localDate === utcDate) {
    return [localDate];
  }
  return [localDate, utcDate];
}

/**
 * Standardizes any date string into Flashscore YYYY-MM-DD format.
 * Handles DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, YYYY.MM.DD, DD.MM. (Flashscore format), and ISO timestamps.
 */
export function normalizeDateStr(dateStr: string): string {
  if (!dateStr) return getStandardDateStr();
  const trimmed = dateStr.trim();

  // If already YYYY-MM-DD, YYYY/MM/DD, or YYYY.MM.DD
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

  // Fallback: try native Date parser using UTC values
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return getStandardDateStr(d);
  }

  return trimmed;
}

/**
 * Standardizes any time string into Flashscore HH:mm 24h format.
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
 * Gets current date and time in a sortable format (YYYY-MM-DD HH:mm).
 */
export function getCurrentDateTimeStr(): string {
  return `${getStandardDateStr()} ${getStandardTimeStr()}`;
}

/**
 * Checks if a match at a given date/time or epoch timestamp has officially kicked off.
 * Strictly uses Flashscore UTC standard time and epoch comparison without browser clock/timezone shifts.
 */
export function hasMatchStarted(matchDate: string, kickOffTime: string, epochTimestamp?: number): boolean {
  // 1. Explicit epoch timestamp check (Flashscore raw feed timestamp)
  if (epochTimestamp && epochTimestamp > 0) {
    const matchMs = epochTimestamp > 1e11 ? epochTimestamp : epochTimestamp * 1000;
    return matchMs <= Date.now();
  }

  if (!matchDate) return false;
  const normTime = normalizeTimeStr(kickOffTime);
  const upperTime = normTime.toUpperCase();

  // 2. Status string checks
  if (['FT', 'HT', 'AET', 'AP', 'LIVE', 'FINISHED', 'IN_PLAY', '1H', '2H', 'EXTRA_TIME'].includes(upperTime)) {
    return true;
  }
  if (['TBD', 'POSTPONED', 'PST', 'CANCELLED', 'CAN'].includes(upperTime)) {
    return false;
  }

  const normDate = normalizeDateStr(matchDate);
  const utcToday = getStandardDateStr();

  // 3. Simple date comparison for past / future days
  if (normDate < utcToday) return true;
  if (normDate > utcToday) return false;

  // 4. Time comparison for matches scheduled today
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

  // Exact Flashscore UTC timestamp calculation
  const matchUtcMs = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], hours, minutes);
  return matchUtcMs <= Date.now();
}

/**
 * Formats match date and time for UI display in standard Flashscore format, converted to user browser local timezone.
 */
export function formatMatchDateTime(
  matchDate: string,
  kickOffTime: string,
  epochTimestamp?: number
): { dateStr: string; timeStr: string } {
  // If we have an epoch timestamp (seconds or ms), format in browser local time
  if (epochTimestamp && epochTimestamp > 0) {
    const d = new Date(epochTimestamp > 1e11 ? epochTimestamp : epochTimestamp * 1000);
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

  const normTime = normalizeTimeStr(kickOffTime);
  const upperTime = normTime.toUpperCase();
  if (
    ['FT', 'HT', 'AET', 'AP', 'LIVE', 'FINISHED', 'IN_PLAY', 'TBD', 'POSTPONED', 'PST', 'CANCELLED', 'CAN'].includes(upperTime) ||
    upperTime.endsWith("'")
  ) {
    return {
      dateStr: normalizeDateStr(matchDate),
      timeStr: normTime,
    };
  }

  // Convert UTC matchDate + kickOffTime into browser local timezone
  if (matchDate && normTime && /^\d{1,2}:\d{2}$/.test(normTime)) {
    const normDate = normalizeDateStr(matchDate);
    const timeParts = normTime.split(':');
    const hh = timeParts[0].padStart(2, '0');
    const mm = timeParts[1];
    const d = new Date(`${normDate}T${hh}:${mm}:00Z`);
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

  return {
    dateStr: normalizeDateStr(matchDate),
    timeStr: normTime,
  };
}

/**
 * Convenience helper to return formatted local kickoff time (HH:mm or status string).
 */
export function formatLocalKickoffTime(
  fixtureOrTime: { matchDate?: string; kickOffTime?: string; timestamp?: number } | string,
  matchDate?: string
): string {
  if (typeof fixtureOrTime === 'string') {
    return formatMatchDateTime(matchDate || '', fixtureOrTime).timeStr;
  }
  return formatMatchDateTime(
    fixtureOrTime.matchDate || '',
    fixtureOrTime.kickOffTime || '',
    fixtureOrTime.timestamp
  ).timeStr;
}

/**
 * Convenience helper to return formatted local match date (YYYY-MM-DD).
 */
export function getFixtureLocalDate(
  fixture: { matchDate?: string; kickOffTime?: string; timestamp?: number }
): string {
  return formatMatchDateTime(
    fixture.matchDate || '',
    fixture.kickOffTime || '',
    fixture.timestamp
  ).dateStr;
}


