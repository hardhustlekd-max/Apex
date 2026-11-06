import { HistoricalMatch, LeagueCode } from './types.js';

/**
 * Pure TypeScript CSV parser that works universally in Node.js and Browser environments without Node Buffer dependencies
 */
function parseCSVToRecords(csvText: string): Record<string, string>[] {
  if (!csvText || !csvText.trim()) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  // Normalize newlines
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];

  // Strip BOM if present in first header
  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
  const result: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const record: Record<string, string> = {};
    let hasData = false;
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      if (header) {
        const val = row[c] !== undefined ? row[c] : '';
        record[header] = val;
        if (val) hasData = true;
      }
    }
    if (hasData) {
      result.push(record);
    }
  }

  return result;
}

export class FootballDataCSVParser {
  /**
   * Parses raw CSV string from football-data.co.uk into structured HistoricalMatch array
   */
  static parseCSV(csvContent: string, defaultSeason = '2024/2025'): HistoricalMatch[] {
    if (!csvContent || csvContent.trim().length === 0) return [];

    let records: Record<string, string>[];
    try {
      records = parseCSVToRecords(csvContent);
    } catch (e) {
      console.error('CSV parse error:', e);
      return [];
    }

    const matches: HistoricalMatch[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const homeTeam = row['HomeTeam'] || row['Home'] || row['HT'];
      const awayTeam = row['AwayTeam'] || row['Away'] || row['AT'];

      if (!homeTeam || !awayTeam) continue;

      const fthg = parseInt(row['FTHG'] || row['HG'] || '0', 10);
      const ftag = parseInt(row['FTAG'] || row['AG'] || '0', 10);
      let ftr = (row['FTR'] || row['Res'] || '').toUpperCase();

      if (ftr !== 'H' && ftr !== 'D' && ftr !== 'A') {
        if (fthg > ftag) ftr = 'H';
        else if (ftag > fthg) ftr = 'A';
        else ftr = 'D';
      }

      const rawDate = row['Date'] || '';
      const formattedDate = this.normalizeDate(rawDate);
      const div: LeagueCode | string = row['Div'] || 'england_premier_league';
      const season = row['Season'] || defaultSeason;

      const id = `${div}_${season.replace('/', '-')}_${homeTeam.replace(/\s+/g, '')}_${awayTeam.replace(/\s+/g, '')}_${formattedDate}`.toLowerCase();

      // Shots
      const hs = row['HS'] ? parseInt(row['HS'], 10) : undefined;
      const asShots = row['AS'] ? parseInt(row['AS'], 10) : undefined;
      const hst = row['HST'] ? parseInt(row['HST'], 10) : undefined;
      const ast = row['AST'] ? parseInt(row['AST'], 10) : undefined;

      matches.push({
        id,
        div,
        season,
        matchDate: formattedDate,
        homeTeam,
        awayTeam,
        fthg: isNaN(fthg) ? 0 : fthg,
        ftag: isNaN(ftag) ? 0 : ftag,
        ftr: ftr as 'H' | 'D' | 'A',
        hs: isNaN(hs as number) ? undefined : hs,
        asShots: isNaN(asShots as number) ? undefined : asShots,
        hst: isNaN(hst as number) ? undefined : hst,
        ast: isNaN(ast as number) ? undefined : ast,
      });
    }

    return matches;
  }

  private static parseOdd(val?: string): number | undefined {
    if (!val) return undefined;
    const parsed = parseFloat(val);
    return isNaN(parsed) || parsed <= 1.0 ? undefined : Number(parsed.toFixed(2));
  }

  private static normalizeDate(dateStr: string): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // Handles DD/MM/YYYY or DD/MM/YY
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
      let day = parts[0].padStart(2, '0');
      let month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) {
        year = parseInt(year, 10) > 50 ? `19${year}` : `20${year}`;
      }
      return `${year}-${month}-${day}`;
    }

    return dateStr;
  }
}
