/**
 * Unified date and time utilities for the application.
 * All date/time strings should follow these standards:
 * - Date: YYYY-MM-DD (e.g. 2026-10-25)
 * - Time: HH:mm (24h, e.g. 14:30)
 * - Full ISO: YYYY-MM-DDTHH:mm:ss.sssZ
 */

/**
 * Gets current season string (e.g. 2024/2025).
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

/**
 * Gets a standardized date string (YYYY-MM-DD).
 */
export function getStandardDateStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets a standardized time string (HH:mm).
 */
export function getStandardTimeStr(d: Date = new Date()): string {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Gets a date string relative to today.
 */
export function getRelativeDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return getStandardDateStr(d);
}

/**
 * Gets the current UTC date string.
 */
export function getUtcDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns possible date strings for today (Local and UTC).
 */
export function getPossibleDateStrs(offsetDays = 0): string[] {
  const local = getRelativeDateStr(offsetDays);
  const utc = getUtcDateStr(offsetDays);
  return Array.from(new Set([local, utc]));
}

/**
 * Standardizes any date string into YYYY-MM-DD.
 * Handles DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, YYYY.MM.DD, and ISO timestamps.
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

  // Handle DD.MM. (Flashscore format without year)
  const shortMatch = trimmed.match(/^(\d{1,2})[.](\d{1,2})\.?$/);
  if (shortMatch) {
    const currentYear = new Date().getFullYear();
    const [, d, m] = shortMatch;
    return `${currentYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try native parser
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return getStandardDateStr(d);
  }

  return trimmed; // Fallback
}

/**
 * Standardizes any time string into HH:mm.
 */
export function normalizeTimeStr(timeStr: string): string {
  if (!timeStr || timeStr.toUpperCase() === 'FT' || timeStr.toUpperCase() === 'TBD') return timeStr;

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
 * Checks if a match at a given date/time has likely started.
 */
export function hasMatchStarted(matchDate: string, kickOffTime: string): boolean {
  const normDate = normalizeDateStr(matchDate);
  const normTime = normalizeTimeStr(kickOffTime);
  const now = getCurrentDateTimeStr();
  
  if (normDate < now.substring(0, 10)) return true;
  if (normDate === now.substring(0, 10)) {
    if (normTime.length === 5 && normTime <= now.substring(11)) return true;
  }
  return false;
}

