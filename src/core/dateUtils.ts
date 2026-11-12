/**
 * Unified date and time utilities for the application.
 * ALL logic strictly follows the Flashscore Standard:
 * - Date: YYYY-MM-DD (strictly UTC)
 * - Time: HH:mm (strictly 24h UTC)
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
 * Gets a standardized UTC time string (HH:mm) in 24h format.
 */
export function getStandardTimeStr(d: Date | string | number = new Date()): string {
  const dateObj = typeof d === 'object' ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '12:00';
  const hours = String(dateObj.getUTCHours()).padStart(2, '0');
  const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Gets a date string relative to today in standard UTC YYYY-MM-DD format.
 */
export function getRelativeDateStr(offsetDays = 0): string {
  return getUtcDateStr(offsetDays);
}

/**
 * Returns the UTC date string for a relative day offset.
 */
export function getPossibleDateStrs(offsetDays = 0): string[] {
  return [getUtcDateStr(offsetDays)];
}

/**
 * Standardizes any date string into Flashscore YYYY-MM-DD UTC format.
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
 * Gets current UTC date and time in a sortable format (YYYY-MM-DD HH:mm).
 */
export function getCurrentDateTimeStr(): string {
  return `${getStandardDateStr()} ${getStandardTimeStr()}`;
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
  epochTimestamp?: number
): { dateStr: string; timeStr: string } {
  if (epochTimestamp && epochTimestamp > 0) {
    const d = new Date(epochTimestamp > 1e11 ? epochTimestamp : epochTimestamp * 1000);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const minutes = String(d.getUTCMinutes()).padStart(2, '0');
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

  return {
    dateStr: normalizeDateStr(matchDate),
    timeStr: normTime,
  };
}

/**
 * Convenience helper to return formatted UTC kickoff time (HH:mm or status string).
 */
export function formatUtcKickoffTime(
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
 * Convenience helper to return formatted UTC match date (YYYY-MM-DD).
 */
export function getFixtureUtcDate(
  fixture: { matchDate?: string; kickOffTime?: string; timestamp?: number }
): string {
  return formatMatchDateTime(
    fixture.matchDate || '',
    fixture.kickOffTime || '',
    fixture.timestamp
  ).dateStr;
}

