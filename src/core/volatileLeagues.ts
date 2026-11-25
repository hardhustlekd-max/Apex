/**
 * Registry of known high-volatility / compressed-parity football competitions.
 * Matches leagues exhibiting elevated upset variance (V_L > 1.10), heavy draw
 * skew (~30%+), or high mid-table parity so they can be filtered cleanly
 * when Volatile League Exclusion is enabled.
 */

export interface VolatileLeagueEntry {
  id: string;
  name: string;
  country: string;
  code: string;
  typicalVl: number;
  reason: string;
  aliases: string[];
}

export const KNOWN_VOLATILE_LEAGUES: VolatileLeagueEntry[] = [
  {
    id: 'england_championship',
    name: 'EFL Championship',
    country: 'England',
    code: 'E1',
    typicalVl: 1.18,
    reason: 'Relentless 46-match fixture congestion, tight squad parity, and frequent away upsets.',
    aliases: ['e1', 'england_championship', 'england championship', 'efl championship', 'english championship'],
  },
  {
    id: 'germany_2_bundesliga',
    name: '2. Bundesliga',
    country: 'Germany',
    code: 'D2',
    typicalVl: 1.16,
    reason: 'Compressed table parity and high-tempo counter-pressing creating volatile match swings.',
    aliases: ['d2', 'germany_2_bundesliga', 'germany 2 bundesliga', '2 bundesliga', '2. bundesliga', 'zweite bundesliga'],
  },
  {
    id: 'italy_serie_b',
    name: 'Serie B',
    country: 'Italy',
    code: 'I2',
    typicalVl: 1.19,
    reason: 'Defensive tactical matchups with ~32% draw skew and narrow goal margins.',
    aliases: ['i2', 'italy_serie_b', 'italy serie b', 'serie b', 'italian serie b'],
  },
  {
    id: 'usa_mls',
    name: 'Major League Soccer (MLS)',
    country: 'USA',
    code: 'MLS',
    typicalVl: 1.21,
    reason: 'Salary-cap roster parity, cross-continent travel fatigue, and elevated upset variance.',
    aliases: ['mls', 'mls1', 'usa_mls', 'usa mls', 'usa_msl', 'major league soccer', 'usa major league soccer'],
  },
  {
    id: 'turkey_super_lig',
    name: 'Süper Lig',
    country: 'Turkey',
    code: 'TUR1',
    typicalVl: 1.14,
    reason: 'Intense home-crowd momentum swings, high card variance, and mid-table unpredictability.',
    aliases: ['tur1', 'turkey_super_lig', 'turkey super lig', 'super lig', 'trendyol super lig'],
  },
  {
    id: 'france_ligue_2',
    name: 'Ligue 2',
    country: 'France',
    code: 'F2',
    typicalVl: 1.17,
    reason: 'Low-scoring physical parity yielding elevated draw rates and tight relegation battles.',
    aliases: ['f2', 'france_ligue_2', 'france ligue 2', 'ligue 2', 'ligue 2 bkt'],
  },
  {
    id: 'spain_laliga2',
    name: 'LaLiga 2 (Segunda División)',
    country: 'Spain',
    code: 'SP2',
    typicalVl: 1.15,
    reason: '42-round marathon with heavy draw frequency and minimal xG separation across mid-table.',
    aliases: ['sp2', 'spain_laliga2', 'spain_laliga_2', 'spain_segunda_division', 'spain laliga2', 'spain laliga 2', 'laliga2', 'laliga 2', 'segunda division'],
  },
  {
    id: 'brazil_serie_a',
    name: 'Brasileirão Série A',
    country: 'Brazil',
    code: 'BRA',
    typicalVl: 1.15,
    reason: 'Multi-competition travel load, frequent squad rotation, and strong home-field parity.',
    aliases: ['bra', 'brazil_serie_a', 'brazil serie a', 'brasileirao', 'brasileirao serie a', 'campeonato brasileiro', 'serie a betano'],
  },
  {
    id: 'argentina_liga_profesional',
    name: 'Liga Profesional',
    country: 'Argentina',
    code: 'ARG1',
    typicalVl: 1.17,
    reason: 'High draw skew, intense derby variance, and compressed table separation.',
    aliases: [
      'arg1',
      'argentina_liga_profesional',
      'argentina_liga_profesional_clausura',
      'argentina_liga_profesional_apertura',
      'argentina liga profesional',
      'liga profesional',
      'torneo betano',
    ],
  },
  {
    id: 'australia_a_league',
    name: 'A-League Men',
    country: 'Australia',
    code: 'AUS1',
    typicalVl: 1.16,
    reason: 'Salary-cap parity, open transition play, and frequent late-match momentum reversals.',
    aliases: ['aus1', 'australia_a_league', 'australia a league', 'a league', 'a league men', 'isuzu ute a league'],
  },
];

function normalizeVolatileKey(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const EXACT_VOLATILE_KEYS = new Set<string>();
for (const entry of KNOWN_VOLATILE_LEAGUES) {
  EXACT_VOLATILE_KEYS.add(normalizeVolatileKey(entry.id));
  EXACT_VOLATILE_KEYS.add(normalizeVolatileKey(entry.code));
  EXACT_VOLATILE_KEYS.add(normalizeVolatileKey(entry.name));
  for (const alias of entry.aliases) {
    EXACT_VOLATILE_KEYS.add(normalizeVolatileKey(alias));
  }
}

const VOLATILE_PATTERNS: RegExp[] = [
  /^e1$/,
  /^d2$/,
  /^i2$/,
  /^f2$/,
  /^sp2$/,
  /^tur1$/,
  /^bra$/,
  /^arg1$/,
  /^aus1$/,
  /^mls1?$/,
  /\bengland\s+championship\b/,
  /\befl\s+championship\b/,
  /\b2\s+bundesliga\b/,
  /\bitaly\s+serie\s+b\b/,
  /\bserie\s+b\b(?!\s+women)/,
  /\bmajor\s+league\s+soccer\b/,
  /\busa\s+mls\b/,
  /\busa\s+msl\b/,
  /\bsuper\s+lig\b(?!\s+women)/,
  /\bfrance\s+ligue\s+2\b/,
  /\bligue\s+2\b(?!\s+women)/,
  /\blaliga\s*2\b/,
  /\bsegunda\s+division\b(?!.*rfef)(?!\s+women)/,
  /\bbrazil\s+serie\s+a\b/,
  /\bbrasileirao\b/,
  /\bargentina\s+liga\s+profesional\b/,
  /\baustralia\s+a\s+league\b/,
  /\ba\s+league\s+men\b/,
];

/**
 * Checks whether a league code, slug, or display name corresponds to one of
 * the known high-volatility / compressed-parity competitions.
 */
export function isKnownVolatileLeague(leagueOrName?: string | null): boolean {
  const norm = normalizeVolatileKey(leagueOrName);
  if (!norm) return false;

  if (EXACT_VOLATILE_KEYS.has(norm)) {
    return true;
  }

  return VOLATILE_PATTERNS.some((re) => re.test(norm));
}
