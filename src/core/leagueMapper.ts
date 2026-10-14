// Canonical mapping between legacy codes, popular codes, and native Flashscore slugs
const MAPPING: Record<string, string> = {
  'E0': 'england_premier_league',
  'E1': 'england_championship',
  'SP1': 'spain_la_liga',
  'D1': 'germany_bundesliga',
  'D2': 'germany_2_bundesliga',
  'D3': 'germany_3_liga',
  'I1': 'italy_serie_a',
  'F1': 'france_ligue_1',
  'N1': 'netherlands_eredivisie',
  'P1': 'portugal_primeira_liga',
  'BRA': 'brazil_serie_a',
  'MLS': 'usa_major_league_soccer',
  'UCL': 'europe_champions_league_league_phase',
  'UEL': 'europe_europa_league_league_phase',
  'UECL': 'europe_uefa_conference_league',
  'BE1': 'belgium_jupiler_pro_league',
  'BEL2': 'belgium_challenger_pro_league',
  'ALG1': 'algeria_ligue_1',
  'ARG1': 'argentina_liga_profesional_clausura',
  'AUS1': 'australia_a_league',
  'SE1': 'sweden_allsvenskan',
  'A1': 'austria_bundesliga',
  'TUR1': 'turkey_super_lig',
  'SCO1': 'scotland_premiership',
};

// Synonym groups representing the same competition
const ALIAS_GROUPS: string[][] = [
  [
    'UCL',
    'EUROPE_CHAMPIONS_LEAGUE_LEAGUE_PHASE',
    'EUROPE_UEFA_CHAMPIONS_LEAGUE',
    'EUROPE_CHAMPIONS_LEAGUE',
    'CHAMPIONS_LEAGUE',
    'CHAMPIONS LEAGUE',
  ],
  [
    'UEL',
    'EUROPE_EUROPA_LEAGUE_LEAGUE_PHASE',
    'EUROPE_UEFA_EUROPA_LEAGUE',
    'EUROPE_EUROPA_LEAGUE',
    'EUROPA_LEAGUE',
    'EUROPA LEAGUE',
  ],
  [
    'UECL',
    'EUROPE_UEFA_CONFERENCE_LEAGUE',
    'EUROPE_CONFERENCE_LEAGUE',
    'CONFERENCE_LEAGUE',
    'CONFERENCE LEAGUE',
  ],
  [
    'E0',
    'ENGLAND_PREMIER_LEAGUE',
    'PREMIER_LEAGUE',
    'PREMIER LEAGUE',
    'ENGLISH PREMIER LEAGUE',
  ],
  [
    'E1',
    'ENGLAND_CHAMPIONSHIP',
    'CHAMPIONSHIP',
    'ENGLISH CHAMPIONSHIP',
  ],
  [
    'SP1',
    'SPAIN_LA_LIGA',
    'SPAIN_LALIGA',
    'LA_LIGA',
    'LA LIGA',
    'LALIGA',
  ],
  [
    'D1',
    'GERMANY_BUNDESLIGA',
    'BUNDESLIGA',
    'GERMAN BUNDESLIGA',
  ],
  [
    'D2',
    'GERMANY_2_BUNDESLIGA',
    '2_BUNDESLIGA',
    '2. BUNDESLIGA',
  ],
  [
    'I1',
    'ITALY_SERIE_A',
    'SERIE_A',
    'SERIE A',
    'ITALIAN SERIE A',
  ],
  [
    'F1',
    'FRANCE_LIGUE_1',
    'LIGUE_1',
    'LIGUE 1',
    'FRENCH LIGUE 1',
  ],
  [
    'N1',
    'NETHERLANDS_EREDIVISIE',
    'EREDIVISIE',
    'DUTCH EREDIVISIE',
  ],
  [
    'P1',
    'PORTUGAL_PRIMEIRA_LIGA',
    'PORTUGAL_LIGA_PORTUGAL',
    'PRIMEIRA_LIGA',
    'PRIMEIRA LIGA',
    'LIGA PORTUGAL',
  ],
  [
    'BRA',
    'BRAZIL_SERIE_A',
    'BRAZIL_SERIE_A',
    'CAMPEONATO_BRASILEIRO',
    'CAMPEONATO BRASILEIRO',
  ],
  [
    'MLS',
    'USA_MAJOR_LEAGUE_SOCCER',
    'MAJOR_LEAGUE_SOCCER',
    'MAJOR LEAGUE SOCCER',
  ],
  [
    'BE1',
    'BELGIUM_JUPILER_PRO_LEAGUE',
    'BELGIAN_PRO_LEAGUE',
    'BELGIAN PRO LEAGUE',
    'JUPILER PRO LEAGUE',
  ],
];

// Reverse map
const REVERSE_MAPPING: Record<string, string> = Object.fromEntries(
  Object.entries(MAPPING).map(([k, v]) => [v, k])
);

export function cleanStr(val: string): string {
  return val
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getSlugForCode(code: string): string {
  const norm = cleanStr(code);
  const up = code.toUpperCase().trim();
  return MAPPING[up] || norm;
}

export function getCodeForSlug(slug: string): string {
  const norm = cleanStr(slug);
  return REVERSE_MAPPING[norm] || slug.toUpperCase();
}

/**
 * Returns all uppercase string aliases and permutations for a given league code or name
 */
export function getLeagueAliases(query: string): string[] {
  if (!query || query === 'ALL') return [];
  const cleanQ = cleanStr(query).toUpperCase();
  const rawUp = query.toUpperCase().trim();
  const found = new Set<string>([cleanQ, rawUp]);

  const mappedSlug = getSlugForCode(query).toUpperCase();
  if (mappedSlug) found.add(mappedSlug);

  const mappedCode = getCodeForSlug(query);
  if (mappedCode) found.add(mappedCode.toUpperCase());

  for (const group of ALIAS_GROUPS) {
    const matchesGroup = group.some((item) => {
      const it = cleanStr(item).toUpperCase();
      return it === cleanQ || cleanQ.includes(it) || it.includes(cleanQ);
    });
    if (matchesGroup) {
      for (const g of group) {
        found.add(g.toUpperCase());
        found.add(cleanStr(g).toUpperCase());
      }
    }
  }

  return Array.from(found).filter(Boolean);
}

/**
 * Tests whether a fixture/match belongs to the requested league query
 */
export function matchesLeague(
  itemLeague: string | undefined,
  itemLeagueName: string | undefined,
  targetQuery: string | undefined
): boolean {
  if (!targetQuery || targetQuery === 'ALL') return true;

  const cleanTarget = cleanStr(targetQuery);
  const cleanItem = itemLeague ? cleanStr(itemLeague) : '';
  const cleanName = itemLeagueName ? cleanStr(itemLeagueName) : '';

  if (cleanItem === cleanTarget || cleanName === cleanTarget) return true;

  const aliases = getLeagueAliases(targetQuery).map((a) => cleanStr(a));
  for (const alias of aliases) {
    if (cleanItem === alias) return true;
    if (cleanName === alias) return true;
    if (cleanItem.includes(alias) || alias.includes(cleanItem)) return true;
    if (cleanName.includes(alias) || alias.includes(cleanName)) return true;
  }

  return false;
}
